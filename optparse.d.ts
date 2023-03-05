declare module "optparse" {
  class OptionParser {
    constructor(switches: readonly (readonly [string, string, string])[])

    banner: string

    on(event: string, handler: (opt: string, value: any) => void): void
    on(unknownOptionhandler: (opt: string, value: any) => void): void

    parse(argv: string[]): void
  }

  export { OptionParser }
}
