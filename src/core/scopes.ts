// A small scope model of a handler (issue #26): which declaration each name refers to, and where it is
// read and written. Function scopes only, as in ES5 (Jint 2.x treats let/const like var). Pure: no
// VS Code or Node dependency.
import type * as acorn from 'acorn';

type Node = acorn.Node & Record<string, any>;

export interface Binding {
  name: string;
  kind: 'var' | 'param' | 'function' | 'catch' | 'other';
  /** The function (or Program) that declares it. */
  scope: Node;
  /** `var x` declarations (with or without a value). */
  decls: Node[];
  /** Places that give it a value: `x = v` / `var x = v` (value: v), `x += v`, `x++`, `for (x in o)` (value: undefined). */
  writes: { node: Node; value?: Node; plain: boolean; fn: Node }[];
  /** Identifiers that read it, with the function they are in. */
  reads: { node: Node; fn: Node }[];
}

export interface Scopes {
  /** The binding an Identifier refers to (references and declarations); undefined for globals. */
  bindingOf: WeakMap<Node, Binding>;
  parentOf: WeakMap<Node, Node>;
  /** The function (or Program) each node is in. */
  fnOf: WeakMap<Node, Node>;
  bindings: Binding[];
}

const isFn = (n: Node) => n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression';

function children(n: Node): Node[] {
  const out: Node[] = [];
  for (const key of Object.keys(n)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const v = n[key];
    if (Array.isArray(v)) {
      for (const c of v) if (c && typeof c.type === 'string') out.push(c);
    } else if (v && typeof v.type === 'string') out.push(v);
  }
  return out;
}

/** Is this Identifier a reference to a variable (not a property name, label or declaration)? */
function isReference(n: Node, parent?: Node): boolean {
  if (!parent) return true;
  if (parent.type === 'MemberExpression' && parent.property === n && !parent.computed) return false;
  if ((parent.type === 'Property' || parent.type === 'MethodDefinition') && parent.key === n && !parent.computed) return !!parent.shorthand;
  if (parent.type === 'VariableDeclarator' && parent.id === n) return false;
  if (isFn(parent) && (parent.id === n || parent.params.includes(n))) return false;
  if (parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') return false;
  if (parent.type === 'CatchClause' && parent.param === n) return false;
  return true;
}

export function analyzeScopes(program: Node): Scopes {
  const parentOf = new WeakMap<Node, Node>();
  const fnOf = new WeakMap<Node, Node>();
  const declared = new Map<Node, Map<string, Binding>>();
  const bindings: Binding[] = [];
  const bindingOf = new WeakMap<Node, Binding>();

  const declare = (scope: Node, name: string, kind: Binding['kind'], decl?: Node): Binding => {
    if (!declared.has(scope)) declared.set(scope, new Map());
    const m = declared.get(scope)!;
    let b = m.get(name);
    if (!b) {
      b = { name, kind, scope, decls: [], writes: [], reads: [] };
      m.set(name, b);
      bindings.push(b);
    } else if (kind === 'param' || kind === 'function') b.kind = kind;
    if (decl) b.decls.push(decl);
    return b;
  };

  // Pass 1: parents, enclosing functions and declarations (hoisted, so they must all be known before references).
  const pass1 = (n: Node, fn: Node) => {
    fnOf.set(n, fn);
    if (n.type === 'VariableDeclarator') {
      if (n.id.type === 'Identifier') declare(fn, n.id.name, 'var', n);
      else for (const id of patternIds(n.id)) declare(fn, id.name, 'other');
    } else if (n.type === 'FunctionDeclaration' && n.id) declare(fn, n.id.name, 'function', n);
    else if (n.type === 'CatchClause' && n.param) for (const id of patternIds(n.param)) declare(fn, id.name, 'catch');
    const inner = isFn(n) ? n : fn;
    if (isFn(n)) {
      if (n.type !== 'FunctionDeclaration' && n.id) declare(n, n.id.name, 'function', n);
      for (const p of n.params) for (const id of patternIds(p)) declare(n, id.name, 'param');
      declare(n, 'arguments', 'other');
    }
    for (const c of children(n)) {
      parentOf.set(c, n);
      pass1(c, inner);
    }
  };
  pass1(program, program);

  const lookup = (name: string, fn: Node): Binding | undefined => {
    for (let s: Node | undefined = fn; s; s = s === program ? undefined : fnOf.get(s)) {
      const b = declared.get(s)?.get(name);
      if (b) return b;
    }
    return undefined;
  };

  // Pass 2: references.
  const pass2 = (n: Node) => {
    if (n.type === 'Identifier') {
      const parent = parentOf.get(n);
      const fn = fnOf.get(n)!;
      if (parent?.type === 'VariableDeclarator' && parent.id === n) {
        const b = lookup(n.name, fn);
        if (b) {
          bindingOf.set(n, b);
          if (parent.init) b.writes.push({ node: n, value: parent.init, plain: true, fn });
        }
      } else if (isReference(n, parent)) {
        const b = lookup(n.name, fn);
        if (b) {
          bindingOf.set(n, b);
          if (parent?.type === 'AssignmentExpression' && parent.left === n) {
            b.writes.push({ node: n, value: parent.operator === '=' ? parent.right : undefined, plain: parent.operator === '=', fn });
            if (parent.operator !== '=') b.reads.push({ node: n, fn });
          } else if (parent?.type === 'UpdateExpression') {
            b.writes.push({ node: n, plain: false, fn });
            b.reads.push({ node: n, fn });
          } else if ((parent?.type === 'ForInStatement' || parent?.type === 'ForOfStatement') && parent.left === n) {
            b.writes.push({ node: n, plain: false, fn });
          } else b.reads.push({ node: n, fn });
        }
      }
    } else if ((n.type === 'ForInStatement' || n.type === 'ForOfStatement') && n.left.type === 'VariableDeclaration') {
      for (const d of n.left.declarations) {
        const b = d.id.type === 'Identifier' ? lookup(d.id.name, fnOf.get(d)!) : undefined;
        if (b) b.writes.push({ node: d.id, plain: false, fn: fnOf.get(d)! });
      }
    }
    for (const c of children(n)) pass2(c);
  };
  pass2(program);
  return { bindingOf, parentOf, fnOf, bindings };
}

function patternIds(p: Node | null | undefined): Node[] {
  if (!p) return [];
  switch (p.type) {
    case 'Identifier':
      return [p];
    case 'ObjectPattern':
      return p.properties.flatMap((x: Node) => patternIds(x.type === 'RestElement' ? x.argument : x.value));
    case 'ArrayPattern':
      return p.elements.flatMap((x: Node) => patternIds(x));
    case 'AssignmentPattern':
      return patternIds(p.left);
    case 'RestElement':
      return patternIds(p.argument);
    default:
      return [];
  }
}
