export class VariableScope {
  private scope: Record<string, any>;

  constructor(initialVariables: Record<string, any> = {}) {
    this.scope = { ...initialVariables };
  }

  get(name: string): any {
    return this.scope[name];
  }

  set(name: string, value: any) {
    this.scope[name] = value;
  }

  getAll(): Record<string, any> {
    return { ...this.scope };
  }

  clone(): VariableScope {
    return new VariableScope(JSON.parse(JSON.stringify(this.scope)));
  }
}
