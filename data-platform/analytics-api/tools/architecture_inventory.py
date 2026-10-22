"""Offline, side-effect-free import/caller inventory for incremental migrations.

AST edges include local imports and type-only imports. Reachability is an upper
bound, not proof of execution or permission to remove a module. No application
module is imported, no environment/secret/config file is loaded.
"""
import argparse
import ast
import hashlib
import json
from pathlib import Path


def service_imports(tree, module_names):
    edges = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            if node.module == "services":
                edges.update(a.name for a in node.names if a.name in module_names)
            elif node.module and node.module.startswith("services."):
                name = node.module.split(".")[1]
                if name in module_names:
                    edges.add(name)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.startswith("services."):
                    name = alias.name.split(".")[1]
                    if name in module_names:
                        edges.add(name)
    return edges


def components(graph):
    """Tarjan components; deterministic output makes inventory diffs reviewable."""
    indices, low, stack, active, result = {}, {}, [], set(), []

    def visit(name):
        indices[name] = low[name] = len(indices)
        stack.append(name)
        active.add(name)
        for other in sorted(graph[name]):
            if other not in indices:
                visit(other)
                low[name] = min(low[name], low[other])
            elif other in active:
                low[name] = min(low[name], indices[other])
        if low[name] == indices[name]:
            group = []
            while True:
                other = stack.pop()
                active.remove(other)
                group.append(other)
                if other == name:
                    break
            result.append(sorted(group))

    for name in sorted(graph):
        if name not in indices:
            visit(name)
    return sorted(result, key=lambda c: (-len(c), c))


def inventory(api_root):
    api_root = Path(api_root)
    modules = {p.stem: p for p in (api_root / "services").glob("*.py") if p.stem != "__init__"}
    trees = {name: ast.parse(p.read_text(encoding="utf-8")) for name, p in modules.items()}
    graph = {name: service_imports(tree, modules) for name, tree in trees.items()}
    entrypoints = {}
    routes = []
    for path in [api_root / "server.py", *sorted((api_root / "routers").glob("*.py"))]:
        if not path.is_file():
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        relative = str(path.relative_to(api_root))
        entrypoints[relative] = sorted(service_imports(tree, modules))
        prefix = ""
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "APIRouter":
                prefix = next((k.value.value for k in node.keywords if k.arg == "prefix" and isinstance(k.value, ast.Constant)), "")
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for decorator in node.decorator_list:
                if (isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Attribute)
                        and decorator.func.attr in {"get", "post", "put", "patch", "delete"}
                        and decorator.args and isinstance(decorator.args[0], ast.Constant)):
                    routes.append(dict(file=relative, function=node.name, line=node.lineno,
                                       method=decorator.func.attr.upper(), path=prefix + str(decorator.args[0].value)))
    pending = [name for names in entrypoints.values() for name in names]
    reachable = set()
    while pending:
        name = pending.pop()
        if name not in reachable:
            reachable.add(name)
            pending.extend(graph[name])
    callers = {name: [] for name in modules}
    for caller, imports in graph.items():
        for name in imports:
            callers[name].append(caller)
    module_rows = []
    for name, path in sorted(modules.items()):
        raw = path.read_bytes()
        functions = [n for n in ast.walk(trees[name]) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
        module_rows.append(dict(name=name, lines=len(raw.splitlines()), sha256=hashlib.sha256(raw).hexdigest(),
                                imports=sorted(graph[name]), callers=sorted(callers[name]),
                                largest_functions=sorted([dict(name=n.name, line=n.lineno, lines=n.end_lineno-n.lineno+1)
                                                          for n in functions], key=lambda f: (-f["lines"], f["line"]))[:5]))
    return dict(version=1, semantics="static AST import upper bound, includes lazy/type-only imports; not runtime call coverage",
                service_modules=len(modules), service_import_edges=sum(map(len, graph.values())),
                router_import_reachable=len(reachable), not_router_import_reachable=sorted(modules.keys()-reachable),
                strongly_connected_components=components(graph), entrypoints=entrypoints,
                routes=sorted(routes, key=lambda r: (r["path"], r["method"])), modules=module_rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    result = inventory(args.api_root)
    wire = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(wire, encoding="utf-8")
        print(json.dumps({k: result[k] for k in ("service_modules", "service_import_edges", "router_import_reachable")}))
    else:
        print(wire, end="")


if __name__ == "__main__":
    main()
