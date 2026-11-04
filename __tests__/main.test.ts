import { run, Deps } from '../main';
import { DATE } from '../src/domain/model/weather-forecast-model';
import { buildFailureMessage } from '../src/domain/service/failure-message';

describe('run', () => {
  let informWeatherNews: jest.Mock;
  let notifyFailure: jest.Mock;
  let deps: Deps;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    informWeatherNews = jest.fn().mockResolvedValue(undefined);
    notifyFailure = jest.fn().mockResolvedValue(undefined);
    deps = { createWeatherNews: jest.fn().mockReturnValue({ informWeatherNews }), notifyFailure };
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('T14 should inform the target day and return 0', async () => {
    // Given
    const env = { DISCORD_URL: 'https://example.test/hook' };
    // When
    const code = await run(['tomorrow'], env, deps);
    // Then
    expect(informWeatherNews).toHaveBeenCalledTimes(1);
    expect(informWeatherNews).toHaveBeenCalledWith(DATE.TOMORROW);
    expect(code).toBe(0);
  });

  it('T15 should return 1 and log the error when informing fails', async () => {
    // Given
    const error = new Error('scraping error');
    informWeatherNews.mockRejectedValue(error);
    const env = { DISCORD_URL: 'https://example.test/hook' };
    // When
    const code = await run(['today'], env, deps);
    // Then
    expect(code).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('scraping error'));
  });

  it('T16 should return 1 without informing when arg is invalid', async () => {
    // Given
    const env = { DISCORD_URL: 'https://example.test/hook' };
    // When
    const code = await run(['yesterday'], env, deps);
    // Then
    expect(code).toBe(1);
    expect(informWeatherNews).not.toHaveBeenCalled();
  });

  it('T17 should return 1 without informing when url is not set', async () => {
    // Given / When
    const code = await run(['today'], {}, deps);
    // Then
    expect(code).toBe(1);
    expect(informWeatherNews).not.toHaveBeenCalled();
  });

  describe('failure notification', () => {
    const PLACE = 'https://weather.yahoo.co.jp/weather/jp/11/4310.html';
    const field = (call: any, name: string): string | undefined =>
      call.data.embeds[0].fields.find((f: { name: string }) => f.name === name)?.value;

    it('MTH47-T22 should send a failure notification once and return 1 when informing fails', async () => {
      // Given
      const error = new Error('scraping error');
      informWeatherNews.mockRejectedValue(error);
      const env = {
        DISCORD_URL: 'https://example.test/hook',
        DISCORD_MENTION: '<@&123>',
        CLOUD_RUN_JOB: 'inform-weather-forecast',
        CLOUD_RUN_EXECUTION: 'exec-1',
      };
      // When
      const code = await run(['today'], env, deps);
      // Then
      expect(code).toBe(1);
      expect(notifyFailure).toHaveBeenCalledTimes(1);
      expect(notifyFailure).toHaveBeenCalledWith(
        buildFailureMessage({ url: 'https://example.test/hook', mention: '<@&123>' }, error, env)
      );
    });

    it('MTH47-T23 should send a failure notification and return 1 when target is invalid', async () => {
      // Given
      const env = { DISCORD_URL: 'https://example.test/hook' };
      // When
      const code = await run(['yesterday'], env, deps);
      // Then
      expect(code).toBe(1);
      expect(notifyFailure).toHaveBeenCalledTimes(1);
      expect(field(notifyFailure.mock.calls[0][0], 'error')).toBe('invalid target: yesterday');
      expect(informWeatherNews).not.toHaveBeenCalled();
    });

    it('MTH47-T24 should return 1 without notifying when DISCORD_URL is not set', async () => {
      // Given / When
      const code = await run(['today'], {}, deps);
      // Then
      expect(code).toBe(1);
      expect(notifyFailure).not.toHaveBeenCalled();
      expect(informWeatherNews).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('MTH47-T25 should return 1 without throwing when the failure notification fails', async () => {
      // Given
      const original = new Error('scraping error');
      const notifyError = new Error('discord down');
      informWeatherNews.mockRejectedValue(original);
      notifyFailure.mockRejectedValue(notifyError);
      // When
      const code = await run(['today'], { DISCORD_URL: 'https://example.test/hook' }, deps);
      // Then
      expect(code).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('scraping error'));
      expect(errorSpy).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('discord down'));
    });

    it('MTH47-T26 should not send a failure notification and return 0 on success', async () => {
      // Given / When
      const code = await run(['tomorrow'], { DISCORD_URL: 'https://example.test/hook' }, deps);
      // Then
      expect(code).toBe(0);
      expect(notifyFailure).not.toHaveBeenCalled();
    });

    it('MTH47-T65 should not log the webhook url even when an axios-like error carries it', async () => {
      // Given
      const axiosLike = Object.assign(new Error('Request failed'), {
        config: { url: 'https://example.test/SECRET' },
      });
      informWeatherNews.mockRejectedValue(axiosLike);
      notifyFailure.mockRejectedValue(axiosLike);
      // When
      await run(['today'], { DISCORD_URL: 'https://example.test/SECRET' }, deps);
      // Then
      expect(errorSpy).toHaveBeenCalled();
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('SECRET');
    });

    it('MTH47-T58 should turn a weather-data-not-found error into a failure notification', async () => {
      // Given
      informWeatherNews.mockRejectedValue(new Error('weather data not found: target=今日 place=' + PLACE));
      const env = { DISCORD_URL: 'https://example.test/hook', DISCORD_MENTION: '<@&123>' };
      // When
      const code = await run(['today'], env, deps);
      // Then
      expect(code).toBe(1);
      expect(notifyFailure).toHaveBeenCalledTimes(1);
      const sent = notifyFailure.mock.calls[0][0];
      expect(sent.data.content).toBe('<@&123> inform-weather failure :umbrella:');
      expect(field(sent, 'error')).toBe('weather data not found: target=今日 place=' + PLACE);
    });
  });
});
