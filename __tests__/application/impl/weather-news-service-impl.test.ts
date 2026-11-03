import { JSDOM } from 'jsdom';
import { createContainer } from '../../../src/inversify.config';
import { TYPES } from '../../../src/inversify.types';
import { WeatherNews } from '../../../src/interface/weather-news';
import { DATE } from '../../../src/domain/model/weather-forecast-model';

const PLACE = 'https://weather.yahoo.co.jp/weather/jp/11/4310.html';

describe('WeatherNews.informWeatherNews with a maintenance page', () => {
  const targets: Array<[string]> = [[DATE.TODAY], [DATE.TOMORROW]];

  it.each(targets)('MTH47-T57 should reject without informing for %s', async (target) => {
    // Given
    const informMessage = jest.fn();
    const container = createContainer({ url: 'https://example.test/hook', mention: '' });
    container.rebind(TYPES.ScrapingService).toConstantValue({
      fetchDomData: jest.fn().mockResolvedValue(new JSDOM('<html><body>メンテナンス中</body></html>')),
    });
    container.rebind(TYPES.InformService).toConstantValue({ informMessage });
    const weatherNews = container.get<WeatherNews>(TYPES.WeatherNews);
    // When / Then
    await expect(weatherNews.informWeatherNews(target as DATE)).rejects.toThrow(
      'weather data not found: target=' + target + ' place=' + PLACE
    );
    expect(informMessage).not.toHaveBeenCalled();
  });
});
