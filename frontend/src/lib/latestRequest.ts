/** Only the latest refresh may publish data, errors or loading state. */
export class LatestRequestGate {
  private sequence = 0;
  begin(): number { return ++this.sequence; }
  invalidate(): void { ++this.sequence; }
  isCurrent(request: number): boolean { return request === this.sequence; }
}
