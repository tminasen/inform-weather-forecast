import { HttpRequest } from '../../infrastructure/http-request';
import { inject, injectable } from 'inversify';
import 'reflect-metadata';
import { TYPES } from '../../inversify.types';
import { RequestParams } from '../model/request-types';
import { DiscordConfig } from '../../config/discord-config';
import { NotificationData } from '../model/weather-forecast-model';

@injectable()
export class InformService {
  constructor(
    @inject(TYPES.HttpRequest) private readonly httpRequest: HttpRequest,
    @inject(TYPES.DiscordConfig) private readonly discordConfig: DiscordConfig
  ) {}

  /**
   * 通知する
   * @param date 天気の日付
   * @param notificationData 通知するデータ
   */
  public async informMessage(date: string, notificationData: NotificationData) {
    const param: RequestParams = {
      url: this.discordConfig.url,
      data: {
        content: this.discordConfig.mention,
        embeds: [
          {
            title: date,
            fields: notificationData,
          },
        ],
      },
    };
    // url は Webhook URL（秘密情報）のため、ログに出さない
    console.info('request param:', param.data);
    await this.httpRequest.post(param);
  }
}
