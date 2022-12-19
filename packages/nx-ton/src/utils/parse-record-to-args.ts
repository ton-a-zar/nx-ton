export function parseRecordToArgs<
  T extends Record<keyof T, number | boolean | string>
>(rec: T, argPrefix: '-' | '--' = '--'): string[] {
  return Object.entries(rec).reduce((args, [key, value]) => {
    if (typeof value === 'boolean') args.push(`${argPrefix}${key}`);

    if (typeof value === 'string' || typeof value === 'number')
      args.push(`${argPrefix}${key} ${value}`);

    return args;
  }, [] as string[]);
}
