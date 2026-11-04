import 'reflect-metadata';
import 'source-map-support/register';
import { DiscordConfig, loadDiscordConfig } from './src/config/discord-config';
import { parseTarget } from './src/config/target';
import { createContainer } from './src/inversify.config';
import { TYPES } from './src/inversify.types';
import { WeatherNews } from './src/interface/weather-news';
import { RequestParams } from './src/domain/model/request-types';
import { buildFailureMessage } from './src/domain/service/failure-message';
import { HttpRequestImpl } from './src/infrastructure/impl/http-request-impl';

export type Deps = {
  readonly createWeatherNews: (config: DiscordConfig) => Pick<WeatherNews, 'informWeatherNews'>;
  readonly notifyFailure: (param: RequestParams) => Promise<unknown>;
};

const defaultDeps: Deps = {
  createWeatherNews: (config) => createContainer(config).get<WeatherNews>(TYPES.WeatherNews),
  notifyFailure: (param) => new HttpRequestImpl().post(param),
};

// AxiosError は config.url に Webhook URL を持つため、オブジェクトのままではなく文字列にして出す
const describeError = (e: unknown): string => (e instanceof Error ? e.stack ?? e.message : String(e));

/**
 * 天気を通知する
 * @param args 実行引数（第1引数に today / tomorrow）
 * @param env 環境変数
 * @param deps 依存
 * @returns 終了コード
 */
export const run = async (
  args: ReadonlyArray<string>,
  env: Readonly<Record<string, string | undefined>>,
  deps: Deps = defaultDeps
): Promise<number> => {
  let config: DiscordConfig;
  try {
    config = loadDiscordConfig(env);
  } catch (e) {
    // 通知先が使えないため、失敗通知は送れない
    console.error('error end:', describeError(e));
    return 1;
  }

  try {
    const target = parseTarget(args[0]);
    console.log('start');
    await deps.createWeatherNews(config).informWeatherNews(target);
    console.log('end');
    return 0;
  } catch (e) {
    console.error('error end:', describeError(e));
    try {
      await deps.notifyFailure(buildFailureMessage(config, e, env));
    } catch (notifyError) {
      console.error('failure notification error:', describeError(notifyError));
    }
    return 1;
  }
};

if (require.main === module) {
  run(process.argv.slice(2), process.env).then((code) => {
    process.exitCode = code;
  });
}
