const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

const ENCRYPTION_PREFIX = 'ENC:v1:';
const ALGO = 'AES-GCM';
const KEY_LENGTH = 256;
const PBKDF2_ITERATIONS = 100000;
const SALT = 'runy-dic-salt-v1';

const TOKEN = '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';

function fetchEncryptionKey() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/kodan76-creator/runy-dic/actions/variables/ENCRYPTION_KEY',
      headers: {
        'Authorization': `token ${TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'node'
      }
    };
    https.get(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        const data = JSON.parse(body);
        resolve(data.value);
      });
    }).on('error', reject);
  });
}

function tryDecrypt(data, passphrase) {
  const base64 = data.slice(ENCRYPTION_PREFIX.length);
  const binary = Buffer.from(base64, 'base64');
  const iv = binary.slice(0, 12);
  const ciphertext = binary.slice(12);
  const key = crypto.pbkdf2Sync(passphrase, SALT, PBKDF2_ITERATIONS, KEY_LENGTH / 8, 'sha256');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

async function main() {
  const data = fs.readFileSync('tsconfig.json', 'utf8').trim();

  if (!data.startsWith(ENCRYPTION_PREFIX)) {
    console.log('File is not encrypted');
    process.exit(0);
  }

  // Fetch key from GitHub
  const githubKey = await fetchEncryptionKey();
  console.log('GitHub key repr:', JSON.stringify(githubKey));
  console.log('GitHub key length:', githubKey.length);

  // Try various key interpretations
  const candidates = [
    githubKey,
    'RunyDic2024SecretKey!@#$%^&*()_+-=[]{}|;\':\\",./<>?',
    'RunyDic2024SecretKey!@#$%^&*()_+-=[]{}|;:\'",./<>?',
    'RunyDic2024SecretKey!@#$%^&*()_+-=[]{}|;:\",./<>?',
  ];

  for (let i = 0; i < candidates.length; i++) {
    const passphrase = candidates[i];
    try {
      const plaintext = tryDecrypt(data, passphrase);
      console.log(`SUCCESS with candidate ${i}!`);
      console.log('---');
      console.log(plaintext);
      process.exit(0);
    } catch (e) {
      console.log(`Failed with candidate ${i}:`, passphrase.substring(0, 30) + '...');
    }
  }

  console.log('All passphrases failed');
}

main().catch(console.error);
