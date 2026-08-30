
import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { BrowserProvider, JsonRpcProvider, Contract, keccak256, toUtf8Bytes } from 'ethers';
import OptiCutABI from '../contracts/OptiCut.json';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || OptiCutABI.address;
const READONLY_RPC = import.meta.env.VITE_RPC_URL || 'https://rpc-amoy.polygon.technology/';
const EXPECTED_CHAIN_ID = READONLY_RPC.includes('127.0.0.1') || READONLY_RPC.includes('localhost') ? 31337 : 80002;
const GAS_LIMIT = 3_000_000n; 

const LOG_CHUNK_SIZE = Number(import.meta.env.VITE_LOG_CHUNK_SIZE || 1500);
const DEPLOYMENT_BLOCK = Number(import.meta.env.VITE_DEPLOYMENT_BLOCK || 0);

const LAB_ROLE = keccak256(toUtf8Bytes('LAB_ROLE'));
const NGJA_ADMIN_ROLE = keccak256(toUtf8Bytes('NGJA_ADMIN_ROLE'));

function makeReadOnlyContract() {
  const p = new JsonRpcProvider(READONLY_RPC);
  return new Contract(CONTRACT_ADDRESS, OptiCutABI.abi, p);
}

function makeDirectProvider() {
  return new JsonRpcProvider(READONLY_RPC);
}

function amoyRpcForMetaMask() {
  if (READONLY_RPC.includes('127.0.0.1') || READONLY_RPC.includes('localhost')) {
    return 'https://rpc-amoy.polygon.technology/';
  }
  return READONLY_RPC;
}

async function txOverrides(walletAddress, gasLimit = GAS_LIMIT) {
  return {
    gasLimit: gasLimit,
    maxPriorityFeePerGas: 30_000_000_000n, 
    maxFeePerGas: 80_000_000_000n          
  };
}

async function waitForTx(tx) {
  return await tx.wait();
}

export function friendlyError(err) {
  const msg = err?.shortMessage || err?.reason || err?.message || String(err);

  // A revert / missing-function on a read-only view (getRevokedLabs, getActiveLabs, …)
  // almost always means the frontend is pointed at an OLD contract that predates these
  // functions. Tell the developer exactly that instead of a generic message.
  if (
    (msg.includes('execution reverted') || msg.includes('missing revert data') ||
     msg.includes('no matching fragment') || msg.includes('call revert exception')) &&
    (msg.includes('getRevokedLabs') || msg.includes('getActiveLabs') ||
     msg.includes('getStonesMintedByLab') || msg.includes('cancelTransformation') ||
     msg.includes('adminReassignStone'))
  ) {
    return 'This function is missing on the deployed contract — your app is pointed at an OLD contract. Redeploy the updated OptiCut.sol, then update VITE_CONTRACT_ADDRESS in .env.local and restart the dev server.';
  }

  // eth_getLogs free-tier / range limit (Alchemy free tier caps at 10 blocks).
  if (
    msg.includes('eth_getLogs') ||
    msg.includes('block range') ||
    msg.includes('Free tier') ||
    msg.includes('could not coalesce error')
  ) {
    return 'An event-log scan (eth_getLogs) was blocked by the RPC free-tier block-range limit. The updated app avoids eth_getLogs; if you still see this, hard-refresh and make sure the new useBlockchain.jsx is loaded.';
  }

  if (msg.includes('execution reverted')) {
    return 'Transaction reverted on-chain. Check your MetaMask network and wallet permissions.';
  }
  if (msg.includes('block range exceeds configured limit') || msg.includes('eth_getLogs')) {
    return 'The RPC refused a large event-log scan. Decrease VITE_LOG_CHUNK_SIZE in your .env.local file.';
  }
  if (msg.includes('-32002') || msg.includes('too many errors') || msg.toLowerCase().includes('rate')) {
    return 'RPC rate-limited. Use a private Polygon Amoy RPC in your .env file.';
  }
  if (msg.includes('user rejected') || msg.includes('User denied')) {
    return 'Transaction rejected in MetaMask.';
  }
  if (msg.includes('insufficient funds')) {
    return 'Insufficient POL balance for gas. Get test POL from a Polygon Amoy faucet.';
  }
  return msg.length > 150 ? msg.slice(0, 150) + '…' : msg;
}

async function queryFilterInChunks(contract, filter, fromBlock, toBlock, chunkSize = LOG_CHUNK_SIZE) {
  const events = [];
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(toBlock, start + chunkSize - 1);
    try {
      events.push(...await contract.queryFilter(filter, start, end));
    } catch (err) {
      if (end > start && chunkSize > 100) {
        const smallerChunk = Math.max(100, Math.floor(chunkSize / 2));
        events.push(...await queryFilterInChunks(contract, filter, start, end, smallerChunk));
      } else {
        throw err;
      }
    }
  }
  return events;
}

// Fallback: reconstruct the lab list from on-chain events.
// Used when the direct RPC call to getAuthorizedLabs() is unavailable.
async function getAuthorizedLabsFromEvents() {
  const dp = makeDirectProvider();
  const c = makeReadOnlyContract();

  const latestBlock = await dp.getBlockNumber();
  const fromBlock = DEPLOYMENT_BLOCK > 0 ? DEPLOYMENT_BLOCK : Math.max(0, latestBlock - 5000);

  const [granted, revoked] = await Promise.all([
    queryFilterInChunks(c, c.filters.LabAuthorized(), fromBlock, latestBlock),
    queryFilterInChunks(c, c.filters.LabRevoked(), fromBlock, latestBlock),
  ]);
  
  const ordered = [
    ...granted.map((event) => ({ type: 'grant', event })),
    ...revoked.map((event) => ({ type: 'revoke', event })),
  ].sort((a, b) => {
    if (a.event.blockNumber !== b.event.blockNumber) {
      return a.event.blockNumber - b.event.blockNumber;
    }
    return a.event.index - b.event.index;
  });
  
  const labMap = new Map();

  for (const item of ordered) {
    const labAddress = item.event.args.lab.toLowerCase();
    if (item.type === 'grant') {
      // ✅ UPDATED: LabAuthorized event now emits `name` — include it here
      labMap.set(labAddress, {
        address: item.event.args.lab,
        name: item.event.args.name,
        authorizedBy: item.event.args.authorizedBy,
        timestamp: Number(item.event.args.timestamp),
      });
    } else {
      labMap.delete(labAddress);
    }
  }

  return Array.from(labMap.values());
}

const BlockchainContext = createContext(null);

export function BlockchainProvider({ children }) {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState('');
  const [isLab, setIsLab] = useState(false);
  const [isNgjaAdmin, setIsNgjaAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contractError, setContractError] = useState(null);

  const checkRoles = useCallback(async (userAddress) => {
    // ✅ FIX (Bug #2): Always reset privileges to false BEFORE the async RPC call.
    // Without this, if the call throws or the wallet switches, the previous wallet's
    // privileges (e.g. isNgjaAdmin=true) stay in React state and bleed into the new session.
    setIsLab(false);
    setIsNgjaAdmin(false);
    try {
      const c = makeReadOnlyContract();
      const [hasLab, hasAdmin] = await Promise.all([
        c.hasRole(LAB_ROLE, userAddress),
        c.hasRole(NGJA_ADMIN_ROLE, userAddress),
      ]);
      setIsLab(hasLab);
      setIsNgjaAdmin(hasAdmin);
      setContractError(null);
    } catch (err) {
      console.error('[OptiCut] checkRoles failed:', err);
      // Roles already reset to false above, so a failed check = no privileges. Correct.
      setContractError(friendlyError(err));
    }
  }, []);

  const checkAndSwitchNetwork = useCallback(async (bp) => {
    const { chainId } = await bp.getNetwork();
    if (Number(chainId) === EXPECTED_CHAIN_ID) return true;

    try {
      const hexChainId = EXPECTED_CHAIN_ID === 80002 ? '0x13882' : '0x7a69'; 
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }],
      });
      return true;
    } catch (e) {
      if (e.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0x13882',
                chainName: 'Polygon Amoy Testnet',
                rpcUrls: [amoyRpcForMetaMask()],
                nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
                blockExplorerUrls: ['https://amoy.polygonscan.com/'],
              },
            ],
          });
          return true;
        } catch {
          alert('Add Polygon Amoy manually in MetaMask.');
          return false;
        }
      }
      alert('Please switch to Polygon Amoy (80002) in MetaMask.');
      return false;
    }
  }, []);

  const init = useCallback(async () => {
    if (!window.ethereum) {
      setLoading(false);
      return;
    }

    try {
      const bp = new BrowserProvider(window.ethereum);
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });

      if (!accounts || accounts.length === 0) {
        setLoading(false);
        return;
      }

      const ok = await checkAndSwitchNetwork(bp);
      if (!ok) {
        setLoading(false);
        return;
      }

      const freshBp = new BrowserProvider(window.ethereum);
      const addr = accounts[0].toLowerCase();
      const s = await freshBp.getSigner(addr);

      setProvider(freshBp);
      setSigner(s);
      setAccount(addr);
      setContract(new Contract(CONTRACT_ADDRESS, OptiCutABI.abi, s));

      await checkRoles(addr);
    } catch (err) {
      console.error('[OptiCut] init error:', err);
      setContractError(friendlyError(err));
    }
    setLoading(false);
  }, [checkAndSwitchNetwork, checkRoles]);

  // ✅ FIX (Bug #3): Track the active account in a ref so the polling closure
  // always reads the latest value without going stale across re-renders.
  const accountRef = useRef('');
  useEffect(() => { accountRef.current = account; }, [account]);

  useEffect(() => {
    init();
    if (!window.ethereum) return;

    // MetaMask's `accountsChanged` event is unreliable when switching wallets
    // inside the extension popup — it sometimes never fires. Keep it as a fast
    // path but back it up with a 2-second poll that compares the actual MetaMask
    // account against what React currently believes is connected.
    const handleReload = () => window.location.reload();
    window.ethereum.on('accountsChanged', handleReload);
    window.ethereum.on('chainChanged', handleReload);

    // ✅ FIX (Bug #3): Aggressive polling — catches wallet switches the event misses.
    // We use a ref (not state) so the closure always sees the current account without
    // restarting the interval on every render.
    const pollInterval = setInterval(async () => {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        const current = (accounts?.[0] ?? '').toLowerCase();
        // Only reload if a wallet IS connected and it has actually changed.
        if (accountRef.current && current && current !== accountRef.current) {
          window.location.reload();
        }
      } catch {
        // Swallow silently — the user may have locked MetaMask.
      }
    }, 2000);

    return () => {
      clearInterval(pollInterval);
      window.ethereum.removeListener('accountsChanged', handleReload);
      window.ethereum.removeListener('chainChanged', handleReload);
    };
  }, [init]);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert('Please install MetaMask!');
      return;
    }
    try {
      await new BrowserProvider(window.ethereum).send('eth_requestAccounts', []);
      await init();
    } catch (err) {
      console.error('Connect rejected:', err);
    }
  }, [init]);

  const getStoneDetails = useCallback(async (tokenId) => {
    const c = makeReadOnlyContract();
    const stone = await c.stones(BigInt(tokenId));
    return {
      parentTokenId: Number(stone.parentTokenId),
      weight: Number(stone.weight),
      stoneState: stone.stoneState,
      ipfsUri: stone.ipfsUri,
      status: Number(stone.status),
      timestamp: Number(stone.timestamp),
      custodian: stone.custodian,
      isHeated: Boolean(stone.isHeated),
      labComments: stone.labComments,
    };
  }, []);

  const getChildIds = useCallback(async (tokenId) => {
    const c = makeReadOnlyContract();
    const ids = await c.getChildIds(BigInt(tokenId));
    return ids.map((id) => Number(id));
  }, []);

  const getLineage = useCallback(async (tokenId) => {
    const chain = [];
    let cur = Number(tokenId);
    while (cur !== 0) {
      const stone = await getStoneDetails(cur);
      chain.unshift({ id: cur, ...stone });
      cur = stone.parentTokenId;
    }
    return chain;
  }, [getStoneDetails]);

  const registerGenesis = useCallback(async (uri, weight, stoneState, isHeated, labComments) => {
    if (!contract || !isLab) throw new Error('Unauthorized');
    const overrides = await txOverrides(account);
    const tx = await contract.registerGenesis(
      uri,
      BigInt(Math.round(parseFloat(weight) * 100)),
      stoneState,
      Boolean(isHeated),
      labComments || '',
      overrides
    );
    return waitForTx(tx);
  }, [contract, isLab, account]);

  const requestTransformation = useCallback(async (tokenId) => {
    if (!contract || !isLab) throw new Error('Unauthorized');
    const overrides = await txOverrides(account);
    const tx = await contract.requestTransformation(BigInt(tokenId), overrides);
    return waitForTx(tx);
  }, [contract, isLab, account]);

  const completeTransformation = useCallback(async (parentId, newWeights, newStates, newUris, newIsHeated, newLabComments) => {
    if (!contract || !isLab) throw new Error('Unauthorized');
    const overrides = await txOverrides(account, GAS_LIMIT * 2n);
    const tx = await contract.completeTransformation(
      BigInt(parentId),
      newWeights.map((w) => BigInt(Math.round(parseFloat(w) * 100))),
      newStates,
      newUris,
      newIsHeated.map((h) => Boolean(h)),
      newLabComments.map((c) => c || ''),
      overrides
    );
    return waitForTx(tx);
  }, [contract, isLab, account]);

  // ✅ UPDATED: grantLab now accepts a `name` param and passes it to the contract.
  // The contract signature is grantLabRole(address lab, string memory name).
  const grantLab = useCallback(async (address, name) => {
    if (!contract || !isNgjaAdmin) throw new Error('Unauthorized');
    const overrides = await txOverrides(account);
    const tx = await contract.grantLabRole(address, name, overrides);
    const receipt = await waitForTx(tx);
    await checkRoles(account);
    return receipt;
  }, [contract, isNgjaAdmin, account, checkRoles]);

  const revokeLab = useCallback(async (address) => {
    if (!contract || !isNgjaAdmin) throw new Error('Unauthorized');
    const overrides = await txOverrides(account);
    const tx = await contract.revokeLabRole(address, overrides);
    const receipt = await waitForTx(tx);
    await checkRoles(account);
    return receipt;
  }, [contract, isNgjaAdmin, account, checkRoles]);

  // ─────────────────────────────────────────────────────────────────────────
  // ✅ NEW: recovery actions for gems stuck in Pending after their lab was revoked.
  // Mirror the contract functions cancelTransformation() and adminReassignStone().
  // ─────────────────────────────────────────────────────────────────────────

  // Release a Pending gem back to Active (NGJA admin, or the holding lab itself).
  const cancelTransformation = useCallback(async (tokenId) => {
    if (!contract) throw new Error('Wallet not connected');
    const overrides = await txOverrides(account);
    const tx = await contract.cancelTransformation(BigInt(tokenId), overrides);
    return waitForTx(tx);
  }, [contract, account]);

  // NGJA-only: force-move a (possibly Pending) gem to another lab or to NGJA, and
  // reset it to Active. `to` must be an authorized lab or an NGJA admin address.
  const adminReassignStone = useCallback(async (tokenId, to) => {
    if (!contract || !isNgjaAdmin) throw new Error('Unauthorized');
    const overrides = await txOverrides(account);
    const tx = await contract.adminReassignStone(BigInt(tokenId), to, overrides);
    return waitForTx(tx);
  }, [contract, isNgjaAdmin, account]);

  // Map the raw AuthorizedLab tuple (now including revoked / revokedAt) to a JS object.
  const mapLab = (lab) => ({
    address: lab.lab,
    name: lab.name,
    authorizedBy: lab.authorizedBy,
    timestamp: Number(lab.timestamp),
    revoked: Boolean(lab.revoked),
    revokedAt: Number(lab.revokedAt),
  });

  // Only labs that still hold LAB_ROLE.
  const getActiveLabs = useCallback(async () => {
    const c = makeReadOnlyContract();
    const raw = await c.getActiveLabs();
    return raw.map(mapLab);
  }, []);

  // Only revoked labs — the ones the recovery panel cares about.
  const getRevokedLabs = useCallback(async () => {
    const c = makeReadOnlyContract();
    const raw = await c.getRevokedLabs();
    return raw.map(mapLab);
  }, []);

  // All stone IDs ever minted by a lab (production history).
  const getStonesMintedByLab = useCallback(async (labAddress) => {
    const c = makeReadOnlyContract();
    const ids = await c.getStonesMintedByLab(labAddress);
    return ids.map((id) => Number(id));
  }, []);

  // Composite helper that powers the "Revoked Labs → gems" panel.
  // For each revoked lab, fetch the stones it minted and their live state.
  // NOTE: deliberately uses c.stones(id) eth_calls (like getStonesForAccount) instead
  // of eth_getLogs, which is unreliable on Polygon Amoy's Bor node.
  const getRevokedLabsWithGems = useCallback(async () => {
    const c = makeReadOnlyContract();
    const revoked = (await c.getRevokedLabs()).map(mapLab);

    const withGems = await Promise.all(revoked.map(async (lab) => {
      const ids = (await c.getStonesMintedByLab(lab.address)).map((id) => Number(id));

      const gems = await Promise.all(ids.map(async (id) => {
        const s = await c.stones(BigInt(id)).catch(() => null);
        if (!s) return null;
        return {
          tokenId: id,
          weight: Number(s.weight),
          stoneState: s.stoneState,
          status: Number(s.status),      // 0 Active, 1 Pending, 2 Burned
          timestamp: Number(s.timestamp),
          custodian: s.custodian,
          isHeated: Boolean(s.isHeated),
          // "still held by this revoked lab" — the case that needs rescuing
          heldByLab: s.custodian && s.custodian.toLowerCase() === lab.address.toLowerCase(),
        };
      }));

      const clean = gems.filter(Boolean);
      return {
        ...lab,
        gems: clean,
        pendingCount: clean.filter((g) => g.status === 1).length,
        stuckCount: clean.filter((g) => g.status === 1 && g.heldByLab).length,
      };
    }));

    return withGems;
  }, []);

  // Primary path: direct contract read (fast, single RPC call).
  // The ABI now includes the `name` field in the AuthorizedLab struct,
  // so lab.name is available after regenerating OptiCut.json via exportABI.js.
  const getAuthorizedLabs = useCallback(async () => {
    // Direct contract read (single eth_call). We intentionally DO NOT fall back to
    // eth_getLogs event reconstruction: Alchemy's free tier caps eth_getLogs at a
    // 10-block range, so the fallback always fails and produced a misleading
    // "public RPC unavailable" error. A direct-read failure now surfaces honestly.
    try {
      const c = makeReadOnlyContract();
      const raw = await c.getAuthorizedLabs();
      return raw.map((lab) => ({
        address: lab.lab,
        name: lab.name,
        authorizedBy: lab.authorizedBy,
        timestamp: Number(lab.timestamp),
        // present on the new contract; undefined/false on older deployments
        revoked: Boolean(lab.revoked),
        revokedAt: lab.revokedAt !== undefined ? Number(lab.revokedAt) : 0,
      }));
    } catch (err) {
      console.error('[OptiCut] getAuthorizedLabs() direct read failed:', err);
      throw new Error(friendlyError(err));
    }
  }, []);

  // Fetch all stones currently custodied by a given address.
  //
  // WHY NOT eth_getLogs: Polygon Amoy's Bor node returns "could not coalesce error"
  // for eth_getLogs queries — even through Alchemy — making event scanning unreliable.
  //
  // HOW THIS WORKS: Stone IDs are sequential starting at 1 (_currentId counter).
  // c.stones(id) is a plain eth_call that works on any RPC. A stone slot where
  // timestamp === 0 was never minted, so we stop there. Burned stones keep their
  // original timestamp, so they still appear in the list with status=2.
  // We run the reads in parallel batches of 10 to keep it fast for small sets.
  const getStonesForAccount = useCallback(async (ownerAddress) => {
    const c = makeReadOnlyContract();
    const result = [];
    const BATCH = 10;
    const MAX_ID = 500; // safety cap — more than enough for a testnet demo

    let done = false;
    for (let start = 1; start <= MAX_ID && !done; start += BATCH) {
      const ids = Array.from(
        { length: Math.min(BATCH, MAX_ID - start + 1) },
        (_, i) => start + i
      );

      // Fire all reads in this batch concurrently
      const batch = await Promise.all(
        ids.map((id) => c.stones(BigInt(id)).catch(() => null))
      );

      for (let i = 0; i < batch.length; i++) {
        const s = batch[i];
        // null = RPC error for that slot; timestamp=0 = slot never minted → stop
        if (!s || Number(s.timestamp) === 0) { done = true; break; }
        if (s.custodian && s.custodian.toLowerCase() === ownerAddress.toLowerCase()) {
          result.push({
            tokenId: ids[i],
            weight: Number(s.weight),
            stoneState: s.stoneState,
            status: Number(s.status),
            timestamp: Number(s.timestamp),
            isHeated: Boolean(s.isHeated),
          });
        }
      }
    }
    return result;
  }, []);

  const getMintedTokenId = useCallback((receipt) => {
    const c = contract || makeReadOnlyContract();
    for (const log of receipt.logs) {
      try {
        const parsed = c.interface.parseLog(log);
        if (parsed?.name === 'StoneCertified') {
          return Number(parsed.args.tokenId);
        }
      } catch {}
    }
    return null;
  }, [contract]);

  const value = useMemo(() => ({
    account, isLab, isNgjaAdmin, loading, connect, contractError,
    checkAndSwitchNetwork, getStoneDetails, getChildren: getChildIds, getChildIds,
    getLineage, registerGenesis, requestTransformation, completeTransformation,
    grantLab, revokeLab, getAuthorizedLabs, getStonesForAccount, getMintedTokenId,
    // ✅ NEW recovery exports
    cancelTransformation, adminReassignStone,
    getActiveLabs, getRevokedLabs, getStonesMintedByLab, getRevokedLabsWithGems,
    contract, provider, signer, readOnlyContract: null,
  }), [
    account, isLab, isNgjaAdmin, loading, connect, contractError,
    checkAndSwitchNetwork, getStoneDetails, getChildIds, getLineage,
    registerGenesis, requestTransformation, completeTransformation,
    grantLab, revokeLab, getAuthorizedLabs, getStonesForAccount, getMintedTokenId,
    cancelTransformation, adminReassignStone,
    getActiveLabs, getRevokedLabs, getStonesMintedByLab, getRevokedLabsWithGems,
    contract, provider, signer,
  ]);

  return (
    <BlockchainContext.Provider value={value}>
      {children}
    </BlockchainContext.Provider>
  );
}

export function useBlockchain() {
  const ctx = useContext(BlockchainContext);
  if (!ctx) throw new Error('useBlockchain must be inside <BlockchainProvider>');
  return ctx;
}
