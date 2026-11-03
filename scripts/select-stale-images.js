'use strict';

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const INDEX_MEDIA_TYPES = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
];
const MANIFEST_MEDIA_TYPES = [
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
];

/**
 * デプロイしたイメージ以外の削除対象を "<package>@<version>" の形で返す。
 * 検証が1つでも外れたら何も返さずに例外を投げる（fail closed）。
 * @param {unknown} images `gcloud artifacts docker images list --format=json` の出力
 * @param {string} deployedDigest デプロイしたイメージの digest
 * @param {string} deployedMediaType デプロイしたイメージの mediaType
 * @returns {string[]}
 */
const selectStaleImages = (images, deployedDigest, deployedMediaType) => {
  if (!Array.isArray(images)) {
    throw new Error('images must be an array');
  }
  if (typeof deployedDigest !== 'string' || !DIGEST_PATTERN.test(deployedDigest)) {
    throw new Error(`invalid deployed digest: ${deployedDigest}`);
  }
  if (INDEX_MEDIA_TYPES.includes(deployedMediaType)) {
    throw new Error(`deployed image is an image index: ${deployedMediaType}`);
  }
  if (!MANIFEST_MEDIA_TYPES.includes(deployedMediaType)) {
    throw new Error(`unexpected media type: ${deployedMediaType}`);
  }
  images.forEach((image) => {
    if (image === null || typeof image !== 'object' || typeof image.package !== 'string' || image.package === '') {
      throw new Error(`invalid image package: ${image === null || typeof image !== 'object' ? image : image.package}`);
    }
    if (typeof image.version !== 'string' || !DIGEST_PATTERN.test(image.version)) {
      throw new Error(`invalid image version: ${image.version}`);
    }
  });
  if (!images.some((image) => image.version === deployedDigest)) {
    throw new Error(`deployed image not found: digest=${deployedDigest}`);
  }
  return images.filter((image) => image.version !== deployedDigest).map((image) => `${image.package}@${image.version}`);
};

const requireEnv = (env, name) => {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is not set`);
  }
  return value;
};

/**
 * 標準入力の JSON と環境変数から、削除対象を改行区切りの文字列で返す
 * @param {string} input 標準入力の内容
 * @param {Record<string, string | undefined>} env 環境変数
 * @returns {string}
 */
const runCli = (input, env) => {
  const deployedDigest = requireEnv(env, 'DEPLOYED_DIGEST');
  const deployedMediaType = requireEnv(env, 'DEPLOYED_MEDIA_TYPE');
  const stale = selectStaleImages(JSON.parse(input), deployedDigest, deployedMediaType);
  return stale.map((ref) => `${ref}\n`).join('');
};

module.exports = { selectStaleImages, runCli };

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    input += chunk;
  });
  process.stdin.on('end', () => {
    try {
      process.stdout.write(runCli(input, process.env));
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
  });
}
