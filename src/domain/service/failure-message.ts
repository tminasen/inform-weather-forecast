import { DiscordConfig } from '../../config/discord-config';
import { RequestParams } from '../model/request-types';

const FIELD_VALUE_LIMIT = 1024;
const UNKNOWN = 'unknown';

const orUnknown = (value: string | undefined): string => (value === undefined || value === '' ? UNKNOWN : value);

const truncate = (value: string): string =>
  value.length <= FIELD_VALUE_LIMIT ? value : `${value.slice(0, FIELD_VALUE_LIMIT - 3)}...`;

const errorToText = (error: unknown): string => orUnknown(error instanceof Error ? error.message : String(error));

/**
 * 失敗通知のリクエストを作る
 * @param config Discord の設定
 * @param error 発生したエラー
 * @param env 環境変数（CLOUD_RUN_JOB / CLOUD_RUN_EXECUTION を使う）
 */
export const buildFailureMessage = (
  config: DiscordConfig,
  error: unknown,
  env: Readonly<Record<string, string | undefined>>
): RequestParams => ({
  url: config.url,
  data: {
    content: `${config.mention} inform-weather failure :umbrella:`,
    embeds: [
      {
        title: 'build detail',
        color: 14427686,
        fields: [
          { name: 'job', value: orUnknown(env.CLOUD_RUN_JOB) },
          { name: 'execution', value: orUnknown(env.CLOUD_RUN_EXECUTION) },
          { name: 'error', value: truncate(errorToText(error)) },
        ],
      },
    ],
  },
});
