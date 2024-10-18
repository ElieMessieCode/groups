export class UnionFind {
  private parent: Map<number, number> = new Map();
  private rank: Map<number, number> = new Map();

  constructor(elements: readonly number[] = []) {
    for (const elem of elements) {
      this.makeSet(elem);
    }
  }

  makeSet(element: number): void {
    if (!this.parent.has(element)) {
      this.parent.set(element, element);
      this.rank.set(element, 0);
    }
  }

  find(element: number): number {
    this.makeSet(element);
    let root = element;
    while (root !== this.parent.get(root)!) {
      root = this.parent.get(root)!;
    }
    let curr = element;
    while (curr !== root) {
      const next = this.parent.get(curr)!;
      this.parent.set(curr, root);
      curr = next;
    }
    return root;
  }

  union(a: number, b: number): boolean {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) {
      return false;
    }
    const rankA = this.rank.get(rootA) ?? 0;
    const rankB = this.rank.get(rootB) ?? 0;
    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA);
    } else {
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
    }
    return true;
  }

  connected(a: number, b: number): boolean {
    return this.find(a) === this.find(b);
  }

  getComponents(): Map<number, number[]> {
    const components = new Map<number, number[]>();
    for (const elem of this.parent.keys()) {
      const root = this.find(elem);
      const list = components.get(root);
      if (list) {
        list.push(elem);
      } else {
        components.set(root, [elem]);
      }
    }
    return components;
  }

  getBlocks(): number[][] {
    return Array.from(this.getComponents().values());
  }
}
