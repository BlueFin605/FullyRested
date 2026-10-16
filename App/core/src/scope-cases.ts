import { ContainerNode, RequestNode, RunNode } from './scope';

export interface TestCase {
  node: RequestNode | RunNode;
  name: string;
}

// A request with runs is tested once per run; one without runs is tested as it is
export function casesFor(request: RequestNode): TestCase[] {
  const runs = request.runs();
  if (runs.length == 0)
    return [{ node: request, name: request.name }];

  return runs.map(r => ({ node: r, name: r.name }));
}

// Every case under a folder or the collection root, in tree order
export function casesForScope(scope: ContainerNode): TestCase[] {
  return scope.requestNodes().flatMap(casesFor);
}
