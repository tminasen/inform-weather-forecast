import { buildFailureMessage } from '../../../src/domain/service/failure-message';

const config = { url: 'https://example.test/hook', mention: '<@&123>' };
const env = { CLOUD_RUN_JOB: 'inform-weather-forecast', CLOUD_RUN_EXECUTION: 'inform-weather-forecast-abc12' };

const fieldValue = (message: ReturnType<typeof buildFailureMessage>, name: string): string | undefined =>
  message.data.embeds[0].fields.find((f) => f.name === name)?.value;

describe('buildFailureMessage', () => {
  it('MTH47-T17 should build the same text as the curl notification with Cloud Run info', () => {
    // Given / When
    const result = buildFailureMessage(config, new Error('scraping error'), env);
    // Then
    expect(result).toEqual({
      url: 'https://example.test/hook',
      data: {
        content: '<@&123> inform-weather failure :umbrella:',
        embeds: [
          {
            title: 'build detail',
            color: 14427686,
            fields: [
              { name: 'job', value: 'inform-weather-forecast' },
              { name: 'execution', value: 'inform-weather-forecast-abc12' },
              { name: 'error', value: 'scraping error' },
            ],
          },
        ],
      },
    });
  });

  it('MTH47-T18 should keep the leading space when mention is empty', () => {
    // Given / When
    const result = buildFailureMessage({ ...config, mention: '' }, new Error('x'), env);
    // Then
    expect(result.data.content).toBe(' inform-weather failure :umbrella:');
  });

  const emptyEnvs: Array<[string, Record<string, string>]> = [
    ['unset', {}],
    ['empty', { CLOUD_RUN_JOB: '', CLOUD_RUN_EXECUTION: '' }],
  ];
  it.each(emptyEnvs)('MTH47-T19 should use unknown when CLOUD_RUN_* is %s', (_name, emptyEnv) => {
    // Given / When
    const result = buildFailureMessage(config, new Error('x'), emptyEnv);
    // Then
    expect(fieldValue(result, 'job')).toBe('unknown');
    expect(fieldValue(result, 'execution')).toBe('unknown');
  });

  const errorCases: Array<[string, unknown, string]> = [
    ['a string', 'boom', 'boom'],
    ['an empty message', new Error(''), 'unknown'],
  ];
  it.each(errorCases)('MTH47-T20 should stringify %s', (_name, error, expected) => {
    // Given / When
    const result = buildFailureMessage(config, error, env);
    // Then
    expect(fieldValue(result, 'error')).toBe(expected);
  });

  const lengthCases: Array<[string, number, string]> = [
    ['2000 chars', 2000, 'x'.repeat(1021) + '...'],
    ['exactly 1024 chars', 1024, 'x'.repeat(1024)],
  ];
  it.each(lengthCases)('MTH47-T21 should truncate long messages (%s)', (_name, length, expected) => {
    // Given / When
    const result = buildFailureMessage(config, new Error('x'.repeat(length)), env);
    // Then
    expect(fieldValue(result, 'error')).toBe(expected);
    expect(fieldValue(result, 'error')?.length).toBeLessThanOrEqual(1024);
  });

  describe('invariant', () => {
    const errors: unknown[] = [
      'boom',
      new Error(''),
      new Error('x'.repeat(1024)),
      new Error('x'.repeat(2000)),
      undefined,
      42,
    ];
    const envs: Array<Record<string, string | undefined>> = [env, {}, { CLOUD_RUN_JOB: '', CLOUD_RUN_EXECUTION: '' }];
    const cases = errors.flatMap((e) => envs.map((v): [unknown, Record<string, string | undefined>] => [e, v]));
    it.each(cases)('MTH47-P5 every field value is 1..1024 chars (case %#)', (error, e) => {
      // Given / When
      const result = buildFailureMessage(config, error, e);
      // Then
      result.data.embeds.forEach((embed) =>
        embed.fields.forEach((f) => {
          expect(f.value.length).toBeGreaterThan(0);
          expect(f.value.length).toBeLessThanOrEqual(1024);
        })
      );
    });
  });
});
