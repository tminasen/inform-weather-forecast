export type ResponseSuccess = {
  status: number;
  data: string;
};
export type RequestParams = {
  readonly url: string;
  readonly data: {
    readonly content: string;
    readonly embeds: ReadonlyArray<{
      readonly title: string;
      readonly color?: number;
      readonly fields: ReadonlyArray<{
        readonly name: string;
        readonly value: string;
        readonly inline?: boolean;
      }>;
    }>;
  };
};
export class ResponseError extends Error {
  constructor(private status: number, private error: any, public message: string) {
    super(message);
  }
}
