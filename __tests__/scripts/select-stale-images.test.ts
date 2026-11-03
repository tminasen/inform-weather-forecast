// eslint-disable-next-line @typescript-eslint/no-var-requires
const { selectStaleImages, runCli } = require('../../scripts/select-stale-images');

const PKG = 'asia-northeast1-docker.pkg.dev/p/r/inform-weather-forecast';
const d = (c: string): string => 'sha256:' + c.repeat(64);
const img = (c: string, tags: string, t: number): Record<string, string> => ({
  package: PKG,
  version: d(c),
  tags,
  createTime: '2026-11-0' + t + 'T00:00:00Z',
});
const ref = (c: string): string => PKG + '@' + d(c);
const FIVE = [img('a', 'sha1', 1), img('b', 'sha2', 2), img('c', 'sha3', 3), img('d', 'sha4', 4), img('e', 'sha5', 5)];
const DOCKER_V2 = 'application/vnd.docker.distribution.manifest.v2+json';
const OCI_MANIFEST = 'application/vnd.oci.image.manifest.v1+json';
const OCI_INDEX = 'application/vnd.oci.image.index.v1+json';
const DOCKER_LIST = 'application/vnd.docker.distribution.manifest.list.v2+json';

describe('selectStaleImages', () => {
  it('MTH47-T1 should return all images except the deployed one in input order', () => {
    // Given / When
    const result = selectStaleImages(FIVE, d('e'), DOCKER_V2);
    // Then
    expect(result).toEqual([ref('a'), ref('b'), ref('c'), ref('d')]);
  });

  it('MTH47-T2 should return all others even when the deployed one is not the newest', () => {
    // Given / When
    const result = selectStaleImages(FIVE, d('b'), DOCKER_V2);
    // Then
    expect(result).toEqual([ref('a'), ref('c'), ref('d'), ref('e')]);
  });

  it('MTH47-T6 should return nothing when only the deployed image exists', () => {
    // Given
    const images = [img('a', 'sha1', 1)];
    // When
    const result = selectStaleImages(images, d('a'), DOCKER_V2);
    // Then
    expect(result).toEqual([]);
  });

  it('MTH47-T8 should include untagged images as stale', () => {
    // Given
    const images = [
      img('a', 'sha1', 1),
      img('b', '', 2),
      { package: PKG, version: d('c'), createTime: '2026-11-03T00:00:00Z' },
      img('d', 'sha4', 4),
    ];
    // When
    const result = selectStaleImages(images, d('d'), DOCKER_V2);
    // Then
    expect(result).toEqual([ref('a'), ref('b'), ref('c')]);
  });

  it('MTH47-T9 should throw when the deployed digest is not in the list', () => {
    // Given / When / Then
    expect(() => selectStaleImages(FIVE, d('9'), DOCKER_V2)).toThrow(
      new Error('deployed image not found: digest=' + d('9'))
    );
  });

  it('MTH47-T11 should throw when images is not an array', () => {
    // Given / When / Then
    expect(() => selectStaleImages({}, d('e'), DOCKER_V2)).toThrow(new Error('images must be an array'));
  });

  it('MTH47-T61 should accept an OCI single manifest', () => {
    // Given / When
    const result = selectStaleImages(FIVE, d('e'), OCI_MANIFEST);
    // Then
    expect(result).toEqual([ref('a'), ref('b'), ref('c'), ref('d')]);
  });

  it('MTH47-T59 should throw when the deployed image is an OCI image index', () => {
    // Given / When / Then
    expect(() => selectStaleImages(FIVE, d('e'), OCI_INDEX)).toThrow(
      new Error('deployed image is an image index: application/vnd.oci.image.index.v1+json')
    );
  });

  it('MTH47-T60 should throw when the deployed image is a Docker manifest list', () => {
    // Given / When / Then
    expect(() => selectStaleImages(FIVE, d('e'), DOCKER_LIST)).toThrow(
      new Error('deployed image is an image index: application/vnd.docker.distribution.manifest.list.v2+json')
    );
  });

  it.each(['', undefined, 'null', 'text/plain', 'APPLICATION/VND.DOCKER.DISTRIBUTION.MANIFEST.V2+JSON'])(
    'MTH47-T62 should throw for unexpected media type %p',
    (mediaType) => {
      // Given / When / Then
      expect(() => selectStaleImages(FIVE, d('e'), mediaType)).toThrow(
        new Error('unexpected media type: ' + mediaType)
      );
    }
  );

  it.each(['', undefined, 'sha256:abc', 'sha256:' + 'E'.repeat(64), 'latest', 'e'.repeat(64)])(
    'MTH47-T63 should throw for invalid deployed digest %p',
    (digest) => {
      // Given / When / Then
      expect(() => selectStaleImages(FIVE, digest, DOCKER_V2)).toThrow(
        new Error('invalid deployed digest: ' + digest)
      );
    }
  );

  describe('invalid image entries', () => {
    const replaceFirst = (patch: Record<string, unknown>, removeKeys: string[] = []): unknown[] => {
      const first: Record<string, unknown> = { ...FIVE[0], ...patch };
      removeKeys.forEach((k) => delete first[k]);
      return [first, ...FIVE.slice(1)];
    };

    it('MTH47-T39 should throw when version is missing', () => {
      // Given
      const images = replaceFirst({}, ['version']);
      // When / Then
      expect(() => selectStaleImages(images, d('e'), DOCKER_V2)).toThrow(
        new Error('invalid image version: undefined')
      );
    });

    it('MTH47-T40 should throw when version is empty', () => {
      // Given
      const images = replaceFirst({ version: '' });
      // When / Then
      expect(() => selectStaleImages(images, d('e'), DOCKER_V2)).toThrow(new Error('invalid image version: '));
    });

    it('MTH47-T41 should throw when version is too short', () => {
      // Given
      const images = replaceFirst({ version: 'sha256:abc' });
      // When / Then
      expect(() => selectStaleImages(images, d('e'), DOCKER_V2)).toThrow(
        new Error('invalid image version: sha256:abc')
      );
    });

    it('MTH47-T42 should throw when version has uppercase hex', () => {
      // Given
      const version = 'sha256:' + 'A'.repeat(64);
      const images = replaceFirst({ version });
      // When / Then
      expect(() => selectStaleImages(images, d('e'), DOCKER_V2)).toThrow(
        new Error('invalid image version: ' + version)
      );
    });

    const packageCases: Array<[string, Record<string, unknown>, string[], string]> = [
      ['empty', { package: '' }, [], ''],
      ['missing', {}, ['package'], 'undefined'],
    ];
    it.each(packageCases)('MTH47-T43 should throw when package is %s', (_name, patch, removeKeys, shown) => {
      // Given
      const images = replaceFirst(patch, removeKeys);
      // When / Then
      expect(() => selectStaleImages(images, d('e'), DOCKER_V2)).toThrow(
        new Error('invalid image package: ' + shown)
      );
    });
  });

  describe('invariants', () => {
    // 件数(1〜6) x タグなしの数(0〜2) x デプロイしたものの位置
    const cases: Array<[number, number, number]> = [];
    for (let count = 1; count <= 6; count++) {
      for (let untagged = 0; untagged <= 2; untagged++) {
        for (let pos = 0; pos < count; pos++) {
          cases.push([count, untagged, pos]);
        }
      }
    }
    const build = (count: number, untagged: number): Array<Record<string, string>> =>
      Array.from({ length: count }, (_, i) => img('0123456789abcdef'[i], i < untagged ? '' : 'tag' + i, 1 + i));

    it.each(cases)('MTH47-P1,P2,P3,P7 count=%i untagged=%i deployedPos=%i', (count, untagged, pos) => {
      // Given
      const images = build(count, untagged);
      const deployed = images[pos].version;
      const deployedRef = PKG + '@' + deployed;
      const allRefs = images.map((i) => i.package + '@' + i.version);
      // When
      const result: string[] = selectStaleImages(images, deployed, DOCKER_V2);
      // Then
      expect(result).not.toContain(deployedRef); // P1
      expect(result.length).toBe(images.length - 1); // P2
      result.forEach((r) => {
        expect(allRefs).toContain(r); // P3
        expect(r).toMatch(/^.+@sha256:[0-9a-f]{64}$/);
      });
      expect(new Set(result).size).toBe(result.length); // P3
      expect(new Set([...result, deployedRef])).toEqual(new Set(allRefs)); // P7
    });

    const badMediaTypes = [OCI_INDEX, DOCKER_LIST, '', undefined, 'null', 'text/plain'];
    const lists: Array<[string, unknown[]]> = [
      ['FIVE', FIVE],
      ['single', [img('a', 'sha1', 1)]],
      ['two', [img('a', 'sha1', 1), img('b', '', 2)]],
    ];
    const p8 = badMediaTypes.flatMap((m) => lists.map(([n, l]): [unknown, string, unknown[]] => [m, n, l]));
    it.each(p8)('MTH47-P8 should always throw for media type %p with %s', (mediaType, _n, images) => {
      // Given
      const deployed = (images[0] as { version: string }).version;
      // When / Then
      expect(() => selectStaleImages(images, deployed, mediaType)).toThrow();
    });
  });
});

describe('runCli', () => {
  const env = { DEPLOYED_DIGEST: d('e'), DEPLOYED_MEDIA_TYPE: DOCKER_V2 };

  it('MTH47-T12 should return stale refs as newline separated text', () => {
    // Given
    const input = JSON.stringify(FIVE);
    // When
    const result = runCli(input, env);
    // Then
    expect(result).toBe([ref('a'), ref('b'), ref('c'), ref('d')].join('\n') + '\n');
  });

  const envCases: Array<[string, Record<string, string>, string]> = [
    ['unset digest', { DEPLOYED_MEDIA_TYPE: DOCKER_V2 }, 'DEPLOYED_DIGEST is not set'],
    ['empty digest', { DEPLOYED_DIGEST: '', DEPLOYED_MEDIA_TYPE: DOCKER_V2 }, 'DEPLOYED_DIGEST is not set'],
    ['blank digest', { DEPLOYED_DIGEST: '  ', DEPLOYED_MEDIA_TYPE: DOCKER_V2 }, 'DEPLOYED_DIGEST is not set'],
    ['unset media type', { DEPLOYED_DIGEST: d('e') }, 'DEPLOYED_MEDIA_TYPE is not set'],
    ['empty media type', { DEPLOYED_DIGEST: d('e'), DEPLOYED_MEDIA_TYPE: '' }, 'DEPLOYED_MEDIA_TYPE is not set'],
    ['blank media type', { DEPLOYED_DIGEST: d('e'), DEPLOYED_MEDIA_TYPE: '  ' }, 'DEPLOYED_MEDIA_TYPE is not set'],
  ];
  it.each(envCases)('MTH47-T14 should throw for %s', (_name, badEnv, message) => {
    // Given / When / Then
    expect(() => runCli(JSON.stringify(FIVE), badEnv)).toThrow(new Error(message));
  });

  it('MTH47-T15 should throw SyntaxError when input is not JSON', () => {
    // Given / When / Then
    expect(() => runCli('not json', env)).toThrow(SyntaxError);
  });

  it('MTH47-T16 should return empty string when nothing is stale', () => {
    // Given
    const input = JSON.stringify([img('a', 'sha1', 1)]);
    // When
    const result = runCli(input, { DEPLOYED_DIGEST: d('a'), DEPLOYED_MEDIA_TYPE: DOCKER_V2 });
    // Then
    expect(result).toBe('');
  });
});
