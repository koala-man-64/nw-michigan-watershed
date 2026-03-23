declare function fixturePath(name: string): string;
declare function readTextFixture(name: string): string;
declare function readJsonFixture<T = unknown>(name: string): T;

declare const fixtureSupport: {
  fixturePath: typeof fixturePath;
  readJsonFixture: typeof readJsonFixture;
  readTextFixture: typeof readTextFixture;
};

export = fixtureSupport;
