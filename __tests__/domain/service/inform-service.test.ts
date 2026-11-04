import { InformService } from '../../../src/domain/service/inform-service';
import { HttpRequest } from '../../../src/infrastructure/http-request';
import { ResponseError } from '../../../src/domain/model/request-types';

describe('InformService.informMessage', () => {
  let httpRequest: jest.Mocked<HttpRequest>;

  beforeEach(() => {
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    httpRequest = { get: jest.fn(), post: jest.fn() };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('T11 should post with url and mention from config', async () => {
    // Given
    httpRequest.post.mockResolvedValue({ status: 204, data: '' });
    const service = new InformService(httpRequest, { url: 'https://example.test/hook', mention: '<@&123>' });
    // When
    await service.informMessage('5月15日(水)の天気', [{ name: '天気', value: '曇り' }]);
    // Then
    expect(httpRequest.post).toHaveBeenCalledTimes(1);
    expect(httpRequest.post).toHaveBeenCalledWith({
      url: 'https://example.test/hook',
      data: {
        content: '<@&123>',
        embeds: [{ title: '5月15日(水)の天気', fields: [{ name: '天気', value: '曇り' }] }],
      },
    });
  });

  it('T12 should post empty content when mention is empty', async () => {
    // Given
    httpRequest.post.mockResolvedValue({ status: 204, data: '' });
    const service = new InformService(httpRequest, { url: 'https://example.test/hook', mention: '' });
    // When
    await service.informMessage('5月15日(水)の天気', []);
    // Then
    const arg = httpRequest.post.mock.calls[0][0];
    expect(arg.data.content).toBe('');
    expect(arg.data.embeds[0].fields).toEqual([]);
  });

  it('T13 should reject with the same ResponseError when post fails', async () => {
    // Given
    const error = new ResponseError(500, 'err', 'Internal Server Error');
    httpRequest.post.mockRejectedValue(error);
    const service = new InformService(httpRequest, { url: 'https://example.test/hook', mention: '' });
    // When / Then
    await expect(service.informMessage('5月15日(水)の天気', [])).rejects.toBe(error);
  });

  it('MTH47-T66 should not pass the webhook url to console.info', async () => {
    // Given
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    httpRequest.post.mockResolvedValue({ status: 204, data: '' });
    const service = new InformService(httpRequest, { url: 'https://example.test/SECRET', mention: '' });
    // When
    await service.informMessage('5月15日(水)の天気', [{ name: '天気', value: '曇り' }]);
    // Then
    expect(infoSpy).toHaveBeenCalled();
    expect(JSON.stringify(infoSpy.mock.calls)).not.toContain('SECRET');
  });
});
