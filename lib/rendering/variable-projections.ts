import { variablesIn } from "./css-analysis";
import { variableRole, type ColorRole } from "./rule-colors";

// Record demand from color declarations, then propagate it through aliases.
// Names/edges are conservative over the document lifetime; no DOM or CSSRule
// objects are retained, and a variable can acquire at most six role variants.
export class VariableProjections {
  private uses = new Map<string, Set<ColorRole>>();
  private aliases = new Map<string, Set<string>>();
  private empty = new Set<ColorRole>();
  revision = 0;
  constructor(private changed: () => void) {}
  roles(name: string): ReadonlySet<ColorRole> {
    return this.uses.get(name) ?? this.empty;
  }
  private propagate(seeds: Array<[string, ColorRole]>) {
    let added = false;
    for (let i = 0; i < seeds.length; i++) {
      const [name, role] = seeds[i]!;
      if (name.startsWith("--dux-")) continue;
      let roles = this.uses.get(name);
      if (roles?.has(role)) continue;
      if (!roles) this.uses.set(name, (roles = new Set()));
      roles.add(role);
      added = true;
      for (const ref of this.aliases.get(name) ?? [])
        seeds.push([ref, variableRole(ref, role)]);
    }
    if (added) {
      this.revision++;
      this.changed();
    }
  }
  use(name: string, role: ColorRole) {
    this.propagate([[name, role]]);
  }
  define(name: string, value: string) {
    const refs = variablesIn(value);
    if (!refs.size) return;
    let aliases = this.aliases.get(name);
    if (!aliases) this.aliases.set(name, (aliases = new Set()));
    const seeds: Array<[string, ColorRole]> = [];
    for (const ref of refs)
      if (!aliases.has(ref)) {
        aliases.add(ref);
        for (const role of this.roles(name))
          seeds.push([ref, variableRole(ref, role)]);
      }
    this.propagate(seeds);
  }
  clear() {
    this.uses.clear();
    this.aliases.clear();
  }
}
