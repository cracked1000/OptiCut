/**
 * Uploads a file to IPFS via Pinata.
 * 
 * TODO: Set VITE_PINATA_JWT in your .env file to enable IPFS uploads.
 * Get your JWT from https://app.pinata.cloud/developers/api-keys
 * Example: VITE_PINATA_JWT=eyJhbGci...
 *
 * @param {File} file - The file to upload
 * @returns {Promise<string>} - The IPFS URI in the form ipfs://{CID}
 */
export const uploadToPinata = async (file) => {
  const jwt = import.meta.env.VITE_PINATA_JWT;
  if (!jwt) {
    throw new Error(
      "Pinata JWT not configured. Please set VITE_PINATA_JWT in your .env file. " +
      "Get your JWT from https://app.pinata.cloud/developers/api-keys"
    );
  }
  const formData = new FormData();
  formData.append('file', file);
  const metadata = JSON.stringify({ name: file.name });
  formData.append('pinataMetadata', metadata);
  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Pinata upload failed: ${response.status} ${errText}`);
  }
  const data = await response.json();
  return `ipfs://${data.IpfsHash}`;
};
