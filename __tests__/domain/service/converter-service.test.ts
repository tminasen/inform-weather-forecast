import { createContainer } from '../../../src/inversify.config';
import { ConverterService } from '../../../src/domain/service/converter-service';
import { TYPES } from '../../../src/inversify.types';
import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';
import { DATE, INDEX, TEMPERATURE, WeatherDate } from '../../../src/domain/model/weather-forecast-model';

const container = createContainer({ url: 'https://example.test/hook', mention: '' });

// mockHTML読み込み
const html = fs.readFileSync(path.join(__dirname, '../../resources/converter-test.html'), 'utf-8');

describe('test converter service today', () => {
  let service: ConverterService;
  let jsDom: JSDOM;

  beforeEach(() => {
    service = container.get<ConverterService>(TYPES.ConverterService);
    jsDom = new JSDOM(html);
  });

  it('domDataFormatter indexList_item', () => {
    const indexList = jsDom.window.document.querySelectorAll('.indexList_item');
    const correct: Map<INDEX, string> = new Map([
      [INDEX.WASHING, 'washingComment1'],
      [INDEX.UMBRELLA, 'umbrellaComment1'],
      [INDEX.UV, 'uv-lightComment1'],
      [INDEX.LAYERING, 'layeringComment1'],
      [INDEX.HEATSTROKE, 'heatstrokeComment1'],
      [INDEX.BEER, 'beerComment1'],
      [INDEX.ICE, 'iceComment1'],
    ]);
    expect(service.indexDomDataFormatter(indexList, DATE.TODAY)).toEqual(correct);
  });

  it('domDataFormatter_pict', () => {
    const pictList = jsDom.window.document.querySelectorAll('.pict');
    const dateList = jsDom.window.document.querySelectorAll('.tabView_item');
    const correctList: Map<DATE, WeatherDate> = new Map([
      [DATE.TODAY, { weather: '曇り', date: '5月15日(水)' }],
      [DATE.TOMORROW, { weather: '曇時々晴', date: '5月16日(木)' }],
    ]);
    expect(service.weatherDomDataFormatter(pictList, dateList)).toEqual(correctList);
  });

  it('domDataFormatter_temp', () => {
    const temperatureList = jsDom.window.document.querySelectorAll('.temp');
    const correctList: Map<TEMPERATURE, string> = new Map([
      [TEMPERATURE.MAX, '23℃[+3]'],
      [TEMPERATURE.MIN, '17℃[0]'],
    ]);
    expect(service.temperatureDomDataFormatter(temperatureList, DATE.TODAY)).toEqual(correctList);
  });

  it('toDetailInformation', () => {
    const index = new Map([
      [INDEX.WASHING, 'washingComment1'],
      [INDEX.UMBRELLA, 'umbrellaComment1'],
      [INDEX.UV, 'uv-lightComment1'],
      [INDEX.LAYERING, 'layeringComment1'],
      [INDEX.HEATSTROKE, 'heatstrokeComment1'],
      [INDEX.BEER, 'beerComment1'],
      [INDEX.ICE, 'iceComment1'],
    ]);
    const weatherDate = new Map([[DATE.TODAY, { weather: '曇り', date: '5月15日（水）' }]]);
    const temperature = new Map([
      [TEMPERATURE.MAX, '23℃[+3]'],
      [TEMPERATURE.MIN, '17℃[0]'],
    ]);
    const correctData = {
      date: '5月15日（水）の天気',
      notificationData: [
        {
          name: '天気',
          value: '曇り',
        },
        {
          name: '最高気温',
          value: '23℃[+3]',
        },
        {
          name: '最低気温',
          value: '17℃[0]',
        },
        {
          name: '洗濯',
          value: 'washingComment1',
        },
        {
          name: '傘',
          value: 'umbrellaComment1',
        },
        {
          name: '紫外線',
          value: 'uv-lightComment1',
        },
        {
          name: '重ね着',
          value: 'layeringComment1',
        },
        {
          name: '熱中症',
          value: 'heatstrokeComment1',
        },
        {
          name: 'ビール',
          value: 'beerComment1',
        },
        {
          name: 'アイス',
          value: 'iceComment1',
        },
        {
          name: 'url',
          value: 'https://weather.yahoo.co.jp/weather/jp/11/4310.html',
        },
      ],
    };
    expect(
      service.toDetailInformation(
        index,
        weatherDate,
        temperature,
        DATE.TODAY,
        'https://weather.yahoo.co.jp/weather/jp/11/4310.html'
      )
    ).toEqual(correctData);
  });
});

describe('test converter service tomorrow', () => {
  let service: ConverterService;
  let jsDom: JSDOM;

  beforeEach(() => {
    service = container.get<ConverterService>(TYPES.ConverterService);
    jsDom = new JSDOM(html);
  });

  it('domDataFormatter indexList_item', () => {
    const indexList = jsDom.window.document.querySelectorAll('.indexList_item');
    const correct: Map<INDEX, string> = new Map([
      [INDEX.WASHING, 'washingComment2'],
      [INDEX.UMBRELLA, 'umbrellaComment2'],
      [INDEX.UV, 'uv-lightComment2'],
      [INDEX.LAYERING, 'layeringComment2'],
      [INDEX.HEATSTROKE, 'heatstrokeComment2'],
      [INDEX.BEER, 'beerComment2'],
      [INDEX.ICE, 'iceComment2'],
    ]);
    expect(service.indexDomDataFormatter(indexList, DATE.TOMORROW)).toEqual(correct);
  });

  it('domDataFormatter_temp', () => {
    const temperatureList = jsDom.window.document.querySelectorAll('.temp');
    const correctList: Map<TEMPERATURE, string> = new Map([
      [TEMPERATURE.MAX, '24℃[+1]'],
      [TEMPERATURE.MIN, '16℃[-1]'],
    ]);
    expect(service.temperatureDomDataFormatter(temperatureList, DATE.TOMORROW)).toEqual(correctList);
  });

  it('toDetailInformation', () => {
    const index = new Map([
      [INDEX.WASHING, 'washingComment2'],
      [INDEX.UMBRELLA, 'umbrellaComment2'],
      [INDEX.UV, 'uv-lightComment2'],
      [INDEX.LAYERING, 'layeringComment2'],
      [INDEX.HEATSTROKE, 'heatstrokeComment2'],
      [INDEX.BEER, 'beerComment2'],
      [INDEX.ICE, 'iceComment2'],
    ]);
    const weatherDate = new Map([[DATE.TOMORROW, { weather: '曇時々晴', date: '5月16日（木）' }]]);
    const temperature = new Map([
      [TEMPERATURE.MAX, '24℃[+3]'],
      [TEMPERATURE.MIN, '16℃[-1]'],
    ]);
    const correctData = {
      date: '5月16日（木）の天気',
      notificationData: [
        {
          name: '天気',
          value: '曇時々晴',
        },
        {
          name: '最高気温',
          value: '24℃[+3]',
        },
        {
          name: '最低気温',
          value: '16℃[-1]',
        },
        {
          name: '洗濯',
          value: 'washingComment2',
        },
        {
          name: '傘',
          value: 'umbrellaComment2',
        },
        {
          name: '紫外線',
          value: 'uv-lightComment2',
        },
        {
          name: '重ね着',
          value: 'layeringComment2',
        },
        {
          name: '熱中症',
          value: 'heatstrokeComment2',
        },
        {
          name: 'ビール',
          value: 'beerComment2',
        },
        {
          name: 'アイス',
          value: 'iceComment2',
        },
        {
          name: 'url',
          value: 'https://weather.yahoo.co.jp/weather/jp/11/4310.html',
        },
      ],
    };
    expect(
      service.toDetailInformation(
        index,
        weatherDate,
        temperature,
        DATE.TOMORROW,
        'https://weather.yahoo.co.jp/weather/jp/11/4310.html'
      )
    ).toEqual(correctData);
  });
});

describe('MTH47 toDetailInformation when weather data is missing', () => {
  const PLACE = 'https://weather.yahoo.co.jp/weather/jp/11/4310.html';
  let service: ConverterService;

  beforeEach(() => {
    service = container.get<ConverterService>(TYPES.ConverterService);
  });

  const undefinedWeatherDateMap = (): Map<DATE, WeatherDate> =>
    new Map([
      [DATE.TODAY, ({ weather: undefined, date: undefined } as unknown) as WeatherDate],
      [DATE.TOMORROW, ({ weather: undefined, date: undefined } as unknown) as WeatherDate],
    ]);
  const undefinedTemperatureMap = (): Map<TEMPERATURE, string> =>
    new Map(([
      [TEMPERATURE.MAX, undefined],
      [TEMPERATURE.MIN, undefined],
    ] as unknown) as Array<[TEMPERATURE, string]>);

  it('MTH47-T51 should throw when all maps are empty even if index exists', () => {
    // Given
    const indexMap = new Map([[INDEX.WASHING, 'washingComment1']]);
    // When / Then
    expect(() => service.toDetailInformation(indexMap, new Map(), new Map(), DATE.TODAY, PLACE)).toThrow(
      new Error('weather data not found: target=今日 place=' + PLACE)
    );
  });

  it('MTH47-T52 should throw when keys exist but values are undefined', () => {
    // Given
    const indexMap = new Map<INDEX, string>();
    // When / Then
    expect(() =>
      service.toDetailInformation(indexMap, undefinedWeatherDateMap(), undefinedTemperatureMap(), DATE.TODAY, PLACE)
    ).toThrow(new Error('weather data not found: target=今日 place=' + PLACE));
  });

  it('MTH47-T53 should return as before when only weather is available', () => {
    // Given
    const weatherDateMap = new Map([[DATE.TODAY, ({ weather: '曇り', date: undefined } as unknown) as WeatherDate]]);
    // When
    const result = service.toDetailInformation(new Map(), weatherDateMap, new Map(), DATE.TODAY, PLACE);
    // Then
    expect(result).toEqual({
      date: 'undefinedの天気',
      notificationData: [
        { name: '天気', value: '曇り' },
        { name: 'url', value: PLACE },
      ],
    });
  });

  it('MTH47-T54 should return as before when only date is available', () => {
    // Given
    const weatherDateMap = new Map([
      [DATE.TODAY, ({ weather: undefined, date: '5月15日（水）' } as unknown) as WeatherDate],
    ]);
    // When
    const result = service.toDetailInformation(new Map(), weatherDateMap, new Map(), DATE.TODAY, PLACE);
    // Then
    expect(result).toEqual({
      date: '5月15日（水）の天気',
      notificationData: [{ name: 'url', value: PLACE }],
    });
  });

  const oneTemperature: Array<[string, Array<[TEMPERATURE, string | undefined]>]> = [
    [
      'max',
      [
        [TEMPERATURE.MAX, '23℃[+3]'],
        [TEMPERATURE.MIN, undefined],
      ],
    ],
    [
      'min',
      [
        [TEMPERATURE.MAX, undefined],
        [TEMPERATURE.MIN, '17℃[0]'],
      ],
    ],
  ];
  it.each(oneTemperature)('MTH47-T55 should return as before when only %s temperature is available', (_n, entries) => {
    // Given
    const temperatureMap = new Map(entries) as Map<TEMPERATURE, string>;
    // When
    const result = service.toDetailInformation(new Map(), new Map(), temperatureMap, DATE.TODAY, PLACE);
    // Then
    expect(result).toEqual({
      date: 'undefinedの天気',
      notificationData: [{ name: 'url', value: PLACE }],
    });
  });

  it('MTH47-T56 should throw for tomorrow when nothing is available', () => {
    // Given / When / Then
    expect(() =>
      service.toDetailInformation(new Map(), undefinedWeatherDateMap(), undefinedTemperatureMap(), DATE.TOMORROW, PLACE)
    ).toThrow(new Error('weather data not found: target=明日 place=' + PLACE));
  });
});
