// First-party reimplementation of the subset of @solidjs/router used by this
// app. Behavior is reproduced faithfully from @solidjs/router 0.15.x's default
// (browser History-based) integration: window.history pushState/replaceState +
// popstate, vcc://-scheme URL normalization, nested + optional (`:id?`) route
// matching, relative href resolution, and live (reactive) params/location. It
// also provides a memory-history integration (createMemoryHistory/MemoryRouter)
// ported from the same release.
//
// This is a port of @solidjs/router (MIT License,
// Copyright (c) 2020-2022 Ryan Carniato). See
// https://github.com/solidjs/solid-router for the original, and
// THIRD-PARTY-NOTICES.md for the license text.
//
// Reactivity is imported ONLY from "../reactivity.js" / "solid-js/web" so a later
// import-map flip can swap the reactive runtime without touching this code.
import {
  createComponent,
  createContext,
  createMemo,
  createRoot,
  createRenderEffect,
  createSignal,
  getOwner,
  on,
  onCleanup,
  runWithOwner,
  splitProps,
  untrack,
  useContext,
  children as resolveChildren,
  mergeProps,
  Show,
  startTransition,
} from "../reactivity.js";
import {
  createComponent as createComponent$web,
  insert,
} from "../reactivity.js";

/**
 * First-party reimplementation of the @solidjs/router subset the app uses (browser + memory history, nested route matching, reactive location/params, A/Navigate).
 * @module lib/router
 */

// --- path helpers -----------------------------------------------------------

const hasSchemeRegex = /^(?:[a-z0-9]+:)?\/\//i;
const trimPathRegex = /^\/+|(\/)\/+$/g;
// Base URL used purely to parse path strings into URL objects; it never leaks
// to the user-visible location. Matches @solidjs/router's "http://sr".
const mockBase = "http://sr";

/**
 * Normalize a path: trim redundant slashes and ensure a single leading slash.
 *
 * @param {string} path - The raw path string.
 * @param {boolean} omitSlash - Skip the leading slash when true.
 * @returns {string} The normalized path (possibly empty).
 */
function normalizePath(path, omitSlash = false) {
  const s = path.replace(trimPathRegex, "$1");
  return s ? (omitSlash || /^[?#]/.test(s) ? s : "/" + s) : "";
}

// Resolve `path` against `base`, optionally relative to `from` (the current
// route's matched path). This is the exact algorithm @solidjs/router uses for
// relative navigation/href (e.g. <Navigate href="session"> inside "/:dir").
/**
 * Resolve `path` against `base`, optionally relative to the current route `from`.
 *
 * @param {string} base - The router base path.
 * @param {string} path - The target path (absolute, relative, or query/hash).
 * @param {string} from - The current matched route path for relative resolution.
 * @returns {string} The resolved absolute path, or undefined for external schemes.
 */
function resolvePath(base, path, from) {
  if (hasSchemeRegex.test(path)) {
    return undefined;
  }
  const basePath = normalizePath(base);
  const fromPath = from && normalizePath(from);
  let result = "";
  if (!fromPath || path.startsWith("/")) {
    result = basePath;
  } else if (fromPath.toLowerCase().indexOf(basePath.toLowerCase()) !== 0) {
    result = basePath + fromPath;
  } else {
    result = fromPath;
  }
  return (result || "/") + normalizePath(path, !result);
}

/**
 * Join two path segments, stripping any trailing splat from `from`.
 *
 * @param {string} from - The base path segment.
 * @param {string} to - The path segment to append.
 * @returns {string} The joined path.
 */
function joinPaths(from, to) {
  return normalizePath(from).replace(/\/*(\*.*)?$/g, "") + normalizePath(to);
}

/**
 * Extract a query string into a params object (repeated keys become arrays).
 *
 * @param {URL} url - The URL whose searchParams to read.
 * @returns {Object} A map of query keys to string or string-array values.
 */
function extractSearchParams(url) {
  const params = {};
  url.searchParams.forEach((value, key) => {
    if (key in params) {
      if (Array.isArray(params[key])) params[key].push(value);
      else params[key] = [params[key], value];
    } else params[key] = value;
  });
  return params;
}

// Expand optional params (`:id?`) into the set of concrete patterns, in the
// order @solidjs/router produces (shorter first), so earlier params win.
/**
 * Expand optional params (`:id?`) into the set of concrete patterns.
 *
 * @param {string} pattern - A route pattern possibly containing optional params.
 * @returns {Array} The list of expanded patterns (shorter first).
 */
function expandOptionals(pattern) {
  let match = /(\/?\:[^\/]+)\?/.exec(pattern);
  if (!match) return [pattern];
  let prefix = pattern.slice(0, match.index);
  let suffix = pattern.slice(match.index + match[0].length);
  const prefixes = [prefix, (prefix += match[1])];
  while ((match = /^(\/\:[^\/]+)\?/.exec(suffix))) {
    prefixes.push((prefix += match[1]));
    suffix = suffix.slice(match[0].length);
  }
  return expandOptionals(suffix).reduce(
    (results, expansion) => [...results, ...prefixes.map((p) => p + expansion)],
    [],
  );
}

/**
 * Test whether a single location segment satisfies a match filter.
 *
 * @param {string} input - The location segment value.
 * @param {*} filter - undefined, a string, function, array, or RegExp filter.
 * @returns {boolean} True when the segment matches the filter.
 */
function matchSegment(input, filter) {
  const isEqual = (s) => s === input;
  if (filter === undefined) {
    return true;
  } else if (typeof filter === "string") {
    return isEqual(filter);
  } else if (typeof filter === "function") {
    return filter(input);
  } else if (Array.isArray(filter)) {
    return filter.some(isEqual);
  } else if (filter instanceof RegExp) {
    return filter.test(input);
  }
  return false;
}

// Build a matcher for a single (already-expanded, no-optional) pattern.
// `partial` allows the location to have extra trailing segments (used for the
// non-leaf parent routes of a nested tree).
/**
 * Build a matcher function for a single concrete (no-optional) route pattern.
 *
 * @param {string} path - The route pattern (may end with a `/*` splat).
 * @param {boolean} partial - Allow extra trailing location segments.
 * @param {Object} matchFilters - Per-param segment filters.
 * @returns {Function} A matcher `(location)` returning `{ path, params }` or null.
 */
function createMatcher(path, partial, matchFilters) {
  const [pattern, splat] = path.split("/*", 2);
  const segments = pattern.split("/").filter(Boolean);
  const len = segments.length;
  return (location) => {
    const locSegments = location.split("/").filter(Boolean);
    const lenDiff = locSegments.length - len;
    if (lenDiff < 0 || (lenDiff > 0 && splat === undefined && !partial)) {
      return null;
    }
    const match = {
      path: len ? "" : "/",
      params: {},
    };
    const matchFilter = (s) =>
      matchFilters === undefined ? undefined : matchFilters[s];
    for (let i = 0; i < len; i++) {
      const segment = segments[i];
      const dynamic = segment[0] === ":";
      const locSegment = dynamic ? locSegments[i] : locSegments[i].toLowerCase();
      const key = dynamic ? segment.slice(1) : segment.toLowerCase();
      if (dynamic && matchSegment(locSegment, matchFilter(key))) {
        match.params[key] = locSegment;
      } else if (dynamic || !matchSegment(locSegment, key)) {
        return null;
      }
      match.path += `/${locSegment}`;
    }
    if (splat) {
      const remainder = lenDiff ? locSegments.slice(-lenDiff).join("/") : "";
      if (matchSegment(remainder, matchFilter(splat))) {
        match.params[splat] = remainder;
      } else {
        return null;
      }
    }
    return match;
  };
}

/**
 * Score a route by specificity (static segments outrank dynamic ones).
 *
 * @param {Object} route - A route record with a `pattern`.
 * @returns {number} The specificity score (higher is more specific).
 */
function scoreRoute(route) {
  const [pattern, splat] = route.pattern.split("/*", 2);
  const segments = pattern.split("/").filter(Boolean);
  return segments.reduce(
    (score, segment) => score + (segment.startsWith(":") ? 2 : 3),
    segments.length - (splat === undefined ? 0 : 1),
  );
}

/**
 * Wrap a value in an array if it is not already one.
 *
 * @param {*} value - A value or array.
 * @returns {Array} The value as an array.
 */
function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

// Flatten a RouteDefinition (the descriptor produced by <Route>) plus `base`
// into one route record per expanded path.
/**
 * Expand a route definition into one route record per concrete path.
 *
 * @param {Object} routeDef - The route descriptor (path/component/children).
 * @param {string} base - The parent base path.
 * @returns {Array} The expanded route records.
 */
function createRoutes(routeDef, base = "") {
  const { component, children } = routeDef;
  const isLeaf = !children || (Array.isArray(children) && !children.length);
  const shared = { key: routeDef, component };
  return asArray(routeDef.path).reduce((acc, originalPath) => {
    for (const expandedPath of expandOptionals(originalPath)) {
      const path = joinPaths(base, expandedPath);
      let pattern = isLeaf ? path : path.split("/*", 1)[0];
      pattern = pattern
        .split("/")
        .map((s) => {
          return s.startsWith(":") || s.startsWith("*") ? s : encodeURIComponent(s);
        })
        .join("/");
      acc.push({
        ...shared,
        originalPath,
        pattern,
        matcher: createMatcher(pattern, !isLeaf, routeDef.matchFilters),
      });
    }
    return acc;
  }, []);
}

/**
 * Build a branch (a root-to-leaf chain of routes) with a score and matcher.
 *
 * @param {Array} routes - The route chain from root to leaf.
 * @param {number} index - Tie-breaking index (earlier branches win on equal score).
 * @returns {Object} A branch `{ routes, score, matcher }`.
 */
function createBranch(routes, index = 0) {
  return {
    routes,
    score: scoreRoute(routes[routes.length - 1]) * 10000 - index,
    matcher(location) {
      const matches = [];
      for (let i = routes.length - 1; i >= 0; i--) {
        const route = routes[i];
        const match = route.matcher(location);
        if (!match) {
          return null;
        }
        matches.unshift({
          ...match,
          route,
        });
      }
      return matches;
    },
  };
}

// Recursively flatten the route tree into a sorted list of branches. Each
// branch is the chain of routes from root to a leaf; higher-scored (more
// specific) branches sort first.
/**
 * Recursively flatten a route tree into a score-sorted list of branches.
 *
 * @param {*} routeDef - A route definition or array of them.
 * @param {string} base - The parent base path.
 * @param {Array} stack - Accumulator of the current route chain (internal).
 * @param {Array} branches - Accumulator of completed branches (internal).
 * @returns {Array} The sorted list of branches.
 */
function createBranches(routeDef, base = "", stack = [], branches = []) {
  const routeDefs = asArray(routeDef);
  for (let i = 0, len = routeDefs.length; i < len; i++) {
    const def = routeDefs[i];
    if (def && typeof def === "object") {
      if (!def.hasOwnProperty("path")) def.path = "";
      const routes = createRoutes(def, base);
      for (const route of routes) {
        stack.push(route);
        const isEmptyArray =
          Array.isArray(def.children) && def.children.length === 0;
        if (def.children && !isEmptyArray) {
          createBranches(def.children, route.pattern, stack, branches);
        } else {
          const branch = createBranch([...stack], branches.length);
          branches.push(branch);
        }
        stack.pop();
      }
    }
  }
  return stack.length ? branches : branches.sort((a, b) => b.score - a.score);
}

/**
 * Find the matches for the first branch that matches the location.
 *
 * @param {Array} branches - The score-sorted branches.
 * @param {string} location - The current pathname.
 * @returns {Array} The matched route chain, or an empty array.
 */
function getRouteMatches(branches, location) {
  for (let i = 0, len = branches.length; i < len; i++) {
    const match = branches[i].matcher(location);
    if (match) {
      return match;
    }
  }
  return [];
}

// A proxy whose property reads each create a memo, so consumers that read e.g.
// `params.dir` subscribe to exactly that key and update live on navigation.
// This is what makes useParams()/useLocation().query reactive per-field.
/**
 * Wrap an object accessor in a proxy whose per-property reads each create a memo,
 * so consumers subscribe to exactly the keys they read.
 *
 * @param {Function} fn - Accessor returning the source object.
 * @returns {Object} A proxy with reactive per-key reads.
 */
function createMemoObject(fn) {
  const map = new Map();
  const owner = getOwner();
  return new Proxy(
    {},
    {
      get(_, property) {
        if (!map.has(property)) {
          runWithOwner(owner, () =>
            map.set(
              property,
              createMemo(() => fn()[property]),
            ),
          );
        }
        return map.get(property)();
      },
      getOwnPropertyDescriptor() {
        return {
          enumerable: true,
          configurable: true,
        };
      },
      ownKeys() {
        return Reflect.ownKeys(fn());
      },
      has(_, property) {
        return property in fn();
      },
    },
  );
}

// Merge an object of updates into a query string, deleting empty/null/undefined
// keys. Mirrors @solidjs/router's mergeSearchString (used by setSearchParams).
/**
 * Merge updates into a query string, deleting empty/null/undefined/empty-array keys.
 *
 * @param {string} search - The existing query string.
 * @param {Object} params - Updates to apply (values, arrays, or nullish to delete).
 * @returns {string} The merged query string (with leading `?`, or empty).
 */
function mergeSearchString(search, params) {
  const merged = new URLSearchParams(search);
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === "" || (value instanceof Array && !value.length)) {
      merged.delete(key);
    } else if (value instanceof Array) {
      merged.delete(key);
      value.forEach((v) => {
        merged.append(key, String(v));
      });
    } else {
      merged.set(key, String(value));
    }
  });
  const s = merged.toString();
  return s ? `?${s}` : "";
}

// --- reactive location ------------------------------------------------------

/**
 * Build a reactive location object (pathname/search/hash/state/key/query) driven
 * by a path accessor.
 *
 * @param {Function} path - Accessor returning the current location string.
 * @param {Function} state - Accessor returning the current history state.
 * @returns {Object} The reactive location object.
 */
function createLocation(path, state) {
  const origin = new URL(mockBase);
  const url = createMemo(
    (prev) => {
      const path_ = path();
      try {
        return new URL(path_, origin);
      } catch (err) {
        console.error(`Invalid path ${path_}`);
        return prev;
      }
    },
    origin,
    {
      equals: (a, b) => a.href === b.href,
    },
  );
  const pathname = createMemo(() => url().pathname);
  const search = createMemo(() => url().search, true);
  const hash = createMemo(() => url().hash);
  const key = () => "";
  const queryFn = on(search, () => extractSearchParams(url()));
  return {
    get pathname() {
      return pathname();
    },
    get search() {
      return search();
    },
    get hash() {
      return hash();
    },
    get state() {
      return state();
    },
    get key() {
      return key();
    },
    query: createMemoObject(queryFn),
  };
}

// --- router context ---------------------------------------------------------

const MAX_REDIRECTS = 100;
const RouterContextObj = createContext();
const RouteContextObj = createContext();
const useRouter = () => {
  const router = useContext(RouterContextObj);
  if (router == null) {
    throw new Error(
      "router primitives can be only used inside a Route.",
    );
  }
  return router;
};
const useRoute = () => useContext(RouteContextObj) || useRouter().base;

// Build the core router state from a history integration. `integration`
// provides a [source, setSource] signal of { value, state } plus a `set`/`go`
// utility. Matches createRouterContext from @solidjs/router for our subset.
/**
 * Build the core router state (location/params/isRouting/navigation) from a
 * history integration and the route branches.
 *
 * @param {Object} integration - `{ signal: [source, setSource], utils }` history adapter.
 * @param {Function} branches - Accessor returning the route branches.
 * @param {Object} options - `{ base }` router options.
 * @returns {Object} The router state `{ base, location, params, isRouting, navigatorFactory, matches }`.
 */
function createRouterContext(integration, branches, options = {}) {
  const {
    signal: [source, setSource],
    utils = {},
  } = integration;
  const basePath = resolvePath("", options.base || "");
  if (basePath === undefined) {
    throw new Error(`${basePath} is not a valid base path`);
  } else if (basePath && !source().value) {
    setSource({ value: basePath, replace: true, scroll: false });
  }

  const [isRouting, setIsRouting] = createSignal(false);
  let lastTransitionTarget;

  // Move the location to a new value inside a transition, so isRouting() goes
  // true during async route work and false when it settles (last call wins).
  const transition = (newTarget) => {
    if (newTarget.value === reference() && newTarget.state === state()) return;
    if (lastTransitionTarget === undefined) setIsRouting(true);
    lastTransitionTarget = newTarget;
    startTransition(() => {
      if (lastTransitionTarget !== newTarget) return;
      setReference(lastTransitionTarget.value);
      setState(lastTransitionTarget.state);
    }).finally(() => {
      if (lastTransitionTarget !== newTarget) return;
      if (newTarget.intent === "navigate") navigateEnd(lastTransitionTarget);
      setIsRouting(false);
      lastTransitionTarget = undefined;
    });
  };

  const [reference, setReference] = createSignal(source().value);
  const [state, setState] = createSignal(source().state);
  const location = createLocation(reference, state);
  const referrers = [];
  const matches = createMemo(() =>
    getRouteMatches(branches(), location.pathname),
  );
  const buildParams = () => {
    const m = matches();
    const params = {};
    for (let i = 0; i < m.length; i++) {
      Object.assign(params, m[i].params);
    }
    return params;
  };
  const params = createMemoObject(buildParams);
  const baseRoute = {
    pattern: basePath,
    path: () => basePath,
    outlet: () => null,
    resolvePath(to) {
      return resolvePath(basePath, to);
    },
  };

  // Drive a transition whenever the history source changes from the outside
  // (e.g. popstate). `defer` skips the initial run.
  createRenderEffect(
    on(
      source,
      (src) => transition({ value: src.value, state: src.state, intent: "native" }),
      { defer: true },
    ),
  );

  /**
   * Navigate from a given route to `to` (number = history delta, string = path).
   *
   * @param {Object} route - The route to resolve relative paths against.
   * @param {*} to - A history delta number or a target path string.
   * @param {Object} options - `{ replace, resolve, scroll, state }` nav options.
   * @returns {void}
   */
  function navigateFromRoute(route, to, options) {
    untrack(() => {
      if (typeof to === "number") {
        if (!to);
        else if (utils.go) {
          utils.go(to);
        } else {
          console.warn("Router integration does not support relative routing");
        }
        return;
      }
      const queryOnly = !to || to[0] === "?";
      const { replace, resolve, scroll, state: nextState } = {
        replace: false,
        resolve: !queryOnly,
        scroll: true,
        ...options,
      };
      const resolvedTo = resolve
        ? route.resolvePath(to)
        : resolvePath((queryOnly && location.pathname) || "", to);
      if (resolvedTo === undefined) {
        throw new Error(`Path '${to}' is not a routable path`);
      } else if (referrers.length >= MAX_REDIRECTS) {
        throw new Error("Too many redirects");
      }
      const current = reference();
      if (resolvedTo !== current || nextState !== state()) {
        referrers.push({
          value: current,
          replace,
          scroll,
          state: state(),
        });
        transition({ value: resolvedTo, state: nextState, intent: "navigate" });
      }
    });
  }

  /**
   * Produce a navigate function bound to a route (defaults to the current route).
   *
   * @param {Object} route - The route to bind navigation to.
   * @returns {Function} A navigate function `(to, options)`.
   */
  function navigatorFactory(route) {
    route = route || useContext(RouteContextObj) || baseRoute;
    return (to, options) => navigateFromRoute(route, to, options);
  }

  /**
   * Commit a completed navigation back to the history source using the original
   * referrer's replace/scroll flags.
   *
   * @param {Object} next - The settled transition target.
   * @returns {void}
   */
  function navigateEnd(next) {
    const first = referrers[0];
    if (first) {
      setSource({
        ...next,
        replace: first.replace,
        scroll: first.scroll,
      });
      referrers.length = 0;
    }
  }

  return {
    base: baseRoute,
    location,
    params,
    isRouting,
    navigatorFactory,
    matches,
  };
}

// Build the route node (with its resolvePath bound to the matched path) for one
// matched level. `outlet` renders the next (nested) level.
/**
 * Build the route node for one matched level, with its outlet rendering the
 * nested level and resolvePath bound to its matched path.
 *
 * @param {Object} router - The router state.
 * @param {Object} parent - The parent route node.
 * @param {Function} outlet - Accessor rendering the next nested level.
 * @param {Function} match - Accessor returning this level's match.
 * @returns {Object} The route node `{ parent, path, outlet, resolvePath }`.
 */
function createRouteContext(router, parent, outlet, match) {
  const { base, location, params } = router;
  const { component } = match().route;
  const path = createMemo(() => match().path);
  const route = {
    parent,
    path,
    outlet: () =>
      component
        ? createComponent(component, {
            params,
            location,
            get children() {
              return outlet();
            },
          })
        : outlet(),
    resolvePath(to) {
      return resolvePath(base.path(), to, path());
    },
  };
  return route;
}

/**
 * Build an outlet accessor that renders a route node's content via a keyed Show,
 * providing the node on RouteContext.
 *
 * @param {Function} child - Accessor returning the route node to render.
 * @returns {Function} An accessor producing the outlet component.
 */
const createOutlet = (child) => {
  return () =>
    createComponent$web(Show, {
      get when() {
        return child();
      },
      keyed: true,
      children: (child) =>
        createComponent$web(RouteContextObj.Provider, {
          value: child,
          get children() {
            return child.outlet();
          },
        }),
    });
};

// Render the matched route chain as nested outlets, reusing route nodes whose
// matched route key is unchanged (so navigation within the same component
// updates params instead of remounting). Mirrors @solidjs/router's <Routes>.
/**
 * Render the matched route chain as nested outlets, reusing route nodes whose
 * matched key is unchanged so navigation within a component updates params
 * instead of remounting.
 *
 * @param {Object} props - Component props.
 * @param {Object} props.routerState - The router state (from createRouterContext).
 * @returns {*} The rendered outlet tree.
 */
function Routes(props) {
  const disposers = [];
  let root;
  const routeStates = createMemo(
    on(props.routerState.matches, (nextMatches, prevMatches, prev) => {
      let equal = prevMatches && nextMatches.length === prevMatches.length;
      const next = [];
      for (let i = 0, len = nextMatches.length; i < len; i++) {
        const prevMatch = prevMatches && prevMatches[i];
        const nextMatch = nextMatches[i];
        if (prev && prevMatch && nextMatch.route.key === prevMatch.route.key) {
          next[i] = prev[i];
        } else {
          equal = false;
          if (disposers[i]) {
            disposers[i]();
          }
          createRoot((dispose) => {
            disposers[i] = dispose;
            next[i] = createRouteContext(
              props.routerState,
              next[i - 1] || props.routerState.base,
              createOutlet(() => routeStates()[i + 1]),
              () => {
                const routeMatches = props.routerState.matches();
                return routeMatches[i] ?? routeMatches[0];
              },
            );
          });
        }
      }
      disposers.splice(nextMatches.length).forEach((dispose) => dispose());
      if (prev && equal) {
        return prev;
      }
      root = next[0];
      return next;
    }),
  );
  return createOutlet(() => routeStates() && root)();
}

// Optional layout wrapper given {children} (the `root` prop). Matches the keyed
// Show in @solidjs/router's Root so the layout receives params/location too.
/**
 * Optional layout wrapper: renders `props.root` (a layout component receiving
 * params/location) around `props.children`, falling back to children alone.
 *
 * @param {Object} props - Component props.
 * @param {Object} props.routerState - The router state.
 * @param {*} props.root - Optional layout component.
 * @param {*} props.children - The routed content.
 * @returns {*} The rendered (optionally wrapped) content.
 */
function Root(props) {
  const location = props.routerState.location;
  const params = props.routerState.params;
  return createComponent$web(Show, {
    get when() {
      return props.root;
    },
    keyed: true,
    get fallback() {
      return props.children;
    },
    children: (Root) =>
      createComponent$web(Root, {
        params: params,
        location: location,
        get children() {
          return props.children;
        },
      }),
  });
}

// Glue an integration to the route tree and provide the router context. The
// route tree is collected from <Route> children via the solid children()
// helper, exactly mirroring how @solidjs/router builds its RouteDefinition tree.
/**
 * Create a Router component for a given history integration: collects the route
 * tree from <Route> children and provides the router context.
 *
 * @param {Object} integration - `{ signal, utils }` history adapter.
 * @returns {Function} A Router component taking `{ base, root, children }`.
 */
const createRouterComponent = (integration) => (props) => {
  const routeDefs = resolveChildren(() => props.children);
  const branches = createMemo(() =>
    createBranches(routeDefs(), props.base || ""),
  );
  const routerState = createRouterContext(integration, branches, {
    base: props.base,
  });
  return createComponent$web(RouterContextObj.Provider, {
    value: routerState,
    get children() {
      return createComponent$web(Root, {
        routerState: routerState,
        get root() {
          return props.root;
        },
        get children() {
          return createComponent$web(Routes, {
            routerState: routerState,
          });
        },
      });
    },
  });
};

// --- history integration ----------------------------------------------------

/**
 * Add an event listener and return a function that removes it.
 *
 * @param {EventTarget} target - The event target.
 * @param {string} type - The event type.
 * @param {Function} handler - The event handler.
 * @returns {Function} An unbind function.
 */
function bindEvent(target, type, handler) {
  target.addEventListener(type, handler);
  return () => target.removeEventListener(type, handler);
}

/**
 * Scroll to the element matching `hash`, or to the top as a fallback.
 *
 * @param {string} hash - The element id to scroll into view.
 * @param {boolean} fallbackTop - Scroll to top when no element is found.
 * @returns {void}
 */
function scrollToHash(hash, fallbackTop) {
  const el = hash && document.getElementById(hash);
  if (el) {
    el.scrollIntoView();
  } else if (fallbackTop) {
    window.scrollTo(0, 0);
  }
}

/**
 * Build a `{ signal: [source, setSource] }` integration backed by window.history
 * (pushState/replaceState + popstate).
 *
 * @returns {Object} A history integration `{ signal }`.
 */
function createBrowserSignal() {
  // Read the current browser location into a { value, state } source. The
  // pathname is normalized to a single leading slash and the search/hash are
  // appended, so vcc://host/<dir>/session/<id>?q#h yields "/<dir>/session/<id>?q#h".
  const getSource = () => {
    const url =
      window.location.pathname.replace(/^\/+/, "/") + window.location.search;
    return {
      value: url + window.location.hash,
      state: window.history.state,
    };
  };
  const [signal, setSignal] = createSignal(getSource(), {
    equals: (a, b) => a.value === b.value && a.state === b.state,
  });
  let ignore = false;
  const set = (next) => {
    if (ignore) return next;
    const { value, replace, scroll, state } = next;
    if (replace) {
      window.history.replaceState(state, "", value);
    } else {
      window.history.pushState(state, "", value);
    }
    scrollToHash(decodeURIComponent(window.location.hash.slice(1)), scroll);
    return next;
  };
  // Wrap setSource so writes both push history and update the signal; popstate
  // refreshes the signal without re-writing history (ignore guard).
  const setSource = (next) => {
    set(next);
    setSignal({ value: next.value, state: next.state });
  };
  const cleanup = bindEvent(window, "popstate", () => {
    ignore = true;
    setSignal(getSource());
    ignore = false;
  });
  if (getOwner()) onCleanup(cleanup);
  return { signal: [signal, setSource] };
}

/**
 * Browser-history Router component.
 *
 * @param {Object} props - Router props `{ base, root, children }`.
 * @returns {*} The rendered router.
 */
function Router(props) {
  const integration = createBrowserSignal();
  return createRouterComponent({
    signal: integration.signal,
    utils: {
      go: (delta) => window.history.go(delta),
    },
  })(props);
}

// --- memory history integration ---------------------------------------------

// In-memory history stack. Direct port of @solidjs/router 0.15.x's
// createMemoryHistory: an `entries` array + `index` cursor, with
// get/set/back/forward/go/listen. Used by environments without a real browser
// location (e.g. the desktop renderer mounted from vcc://renderer/index.html,
// whose pathname would otherwise mismatch the app's `/` and `/:dir` routes).
// Starts at "/" so the initial render matches the root route.
/**
 * Create an in-memory history stack (entries + index cursor) with get/set/back/
 * forward/go/listen, for environments without a real browser location.
 *
 * @returns {Object} A memory-history object.
 */
function createMemoryHistory() {
  const entries = ["/"];
  let index = 0;
  const listeners = [];
  const go = (n) => {
    // https://github.com/remix-run/react-router/blob/682810ca929d0e3c64a76f8d6e465196b7a2ac58/packages/router/history.ts#L245
    index = Math.max(0, Math.min(index + n, entries.length - 1));
    const value = entries[index];
    listeners.forEach((listener) => listener(value));
  };
  return {
    get: () => entries[index],
    set: ({ value, scroll, replace }) => {
      if (replace) {
        entries[index] = value;
      } else {
        entries.splice(index + 1, entries.length - index, value);
        index++;
      }
      listeners.forEach((listener) => listener(value));
      setTimeout(() => {
        if (scroll) {
          scrollToHash(value.split("#")[1] || "", true);
        }
      }, 0);
    },
    back: () => {
      go(-1);
    },
    forward: () => {
      go(1);
    },
    go,
    listen: (listener) => {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        listeners.splice(idx, 1);
      };
    },
  };
}

// Bridge a memory history (get/set/listen) into the [source, setSource] signal
// shape that createRouterComponent expects (the same contract createBrowserSignal
// fulfills for window.history). The ONLY difference from the browser adapter is
// the location SOURCE: here get()/set()/listen() drive a string-valued stack
// instead of window.location + pushState/popstate. Memory history has no `state`,
// so state is tracked alongside the signal and threaded back through set().
/**
 * Bridge a memory history into the `{ signal: [source, setSource] }` integration
 * shape the router expects.
 *
 * @param {Object} history - A memory-history object (get/set/listen).
 * @returns {Object} A history integration `{ signal }`.
 */
function createMemorySignal(history) {
  const getSource = () => ({ value: history.get(), state: null });
  const [signal, setSignal] = createSignal(getSource(), {
    equals: (a, b) => a.value === b.value && a.state === b.state,
  });
  let ignore = false;
  // Wrap setSource so router-driven writes both push the memory stack and update
  // the signal; external history.listen notifications refresh the signal without
  // re-writing the stack (ignore guard), mirroring the popstate path.
  const setSource = (next) => {
    if (!ignore) {
      history.set({ value: next.value, scroll: next.scroll, replace: next.replace });
    }
    setSignal({ value: next.value, state: next.state ?? null });
  };
  const cleanup = history.listen((value) => {
    ignore = true;
    setSignal({ value, state: null });
    ignore = false;
  });
  if (getOwner()) onCleanup(cleanup);
  return { signal: [signal, setSource] };
}

/**
 * Memory-history Router component (uses props.history or a fresh memory history).
 *
 * @param {Object} props - Router props `{ history, base, root, children }`.
 * @returns {*} The rendered router.
 */
function MemoryRouter(props) {
  const history = props.history || createMemoryHistory();
  const integration = createMemorySignal(history);
  return createRouterComponent({
    signal: integration.signal,
    utils: {
      go: (delta) => history.go(delta),
    },
  })(props);
}

// --- public components & hooks ----------------------------------------------

// <Route> is declaration-only: it returns a RouteDefinition descriptor (its own
// props with resolved children). createBranches() reads these descriptors; the
// element is never rendered to DOM itself.
/**
 * Declaration-only <Route>: returns a RouteDefinition descriptor consumed by the
 * branch builder (never rendered to DOM itself).
 *
 * @param {Object} props - Route props (path/component/children/matchFilters).
 * @returns {Object} A RouteDefinition descriptor.
 */
const Route = (props) => {
  const childRoutes = resolveChildren(() => props.children);
  return mergeProps(props, {
    get children() {
      return childRoutes();
    },
  });
};

/**
 * @returns {Function} A navigate function bound to the current route.
 */
const useNavigate = () => useRouter().navigatorFactory();
/**
 * @returns {Object} The reactive location object.
 */
const useLocation = () => useRouter().location;
/**
 * @returns {Function} An accessor for whether a navigation is in progress.
 */
const useIsRouting = () => useRouter().isRouting;
/**
 * @returns {Object} The reactive params object (per-key reactive).
 */
const useParams = () => useRouter().params;

/**
 * Resolve a (possibly relative) path accessor against the current route.
 *
 * @param {Function} path - Accessor returning the path to resolve.
 * @returns {Function} A memo accessor for the resolved path.
 */
const useResolvedPath = (path) => {
  const route = useRoute();
  return createMemo(() => route.resolvePath(path()));
};

/**
 * Reactive search-params hook.
 *
 * @returns {Array} `[query, setSearchParams]` reactive query and updater.
 */
const useSearchParams = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const setSearchParams = (params, options) => {
    const searchString = untrack(
      () => mergeSearchString(location.search, params) + location.hash,
    );
    navigate(searchString, {
      scroll: false,
      resolve: false,
      ...options,
    });
  };
  return [location.query, setSearchParams];
};

// <Navigate href> performs an immediate replace-navigation on render. `href`
// may be relative (resolved against the current route, e.g. "session" inside
// "/:dir") because navigate() defaults resolve:true for non-query paths.
/**
 * Perform an immediate replace-navigation on render to `props.href`.
 *
 * @param {Object} props - Component props.
 * @param {*} props.href - Target path string, or a function `({ navigate, location }) => path`.
 * @param {*} props.state - History state to attach.
 * @returns {null} Renders nothing.
 */
function Navigate(props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { href, state } = props;
  const path =
    typeof href === "function" ? href({ navigate, location }) : href;
  navigate(path, { replace: true, state });
  return null;
}

// <A> link: resolves href against the current route, renders an <a>, and
// intercepts clicks to navigate via history instead of a full page load.
// Active classes + prop handling mirror @solidjs/router's <A>: href/state/
// class/activeClass/inactiveClass/end are split out of the spread (they are not
// raw DOM attributes), while the rest (onClick, onPointerDown, onFocus,
// children, …) pass straight through. @solidjs/router routes link clicks via a
// document-level delegated listener; here an element-level onClick that runs
// after the consumer handler does the same navigation, with identical guards.
/**
 * Router link: renders an <a> with reactive href/active-class/aria-current and
 * intercepts plain left-clicks to navigate via history instead of reloading.
 *
 * @param {Object} props - Link props.
 * @param {*} props.href - The target path (resolved against the current route).
 * @param {*} props.state - History state to attach on navigation.
 * @param {string} props.class - Base class always applied.
 * @param {string} props.activeClass - Class applied when the link is active.
 * @param {string} props.inactiveClass - Class applied when the link is inactive.
 * @param {boolean} props.end - Match the path exactly (vs prefix) for active state.
 * @returns {HTMLElement} The anchor element.
 */
function A(props) {
  props = mergeProps({ inactiveClass: "inactive", activeClass: "active" }, props);
  const [, rest] = splitProps(props, [
    "href",
    "state",
    "class",
    "activeClass",
    "inactiveClass",
    "end",
  ]);
  const navigate = useNavigate();
  const to = useResolvedPath(() => props.href);
  const location = useLocation();
  const isActive = createMemo(() => {
    const to_ = to();
    if (to_ === undefined) return [false, false];
    const path = normalizePath(to_.split(/[?#]/, 1)[0]).toLowerCase();
    const loc = decodeURI(normalizePath(location.pathname).toLowerCase());
    return [
      props.end ? path === loc : loc.startsWith(path + "/") || loc === path,
      path === loc,
    ];
  });
  /**
   * Click interceptor: navigate via history on a plain left-click, deferring to
   * the browser for modified clicks, non-left buttons, or targeted links.
   *
   * @param {MouseEvent} evt - The click event.
   * @returns {void}
   */
  const navigateOnClick = (evt) => {
    if (
      evt.defaultPrevented ||
      evt.button !== 0 ||
      evt.metaKey ||
      evt.altKey ||
      evt.ctrlKey ||
      evt.shiftKey
    )
      return;
    if (props.target) return;
    const resolved = to();
    if (resolved === undefined) return;
    evt.preventDefault();
    navigate(resolved, {
      resolve: false,
      replace: !!props.replace,
      scroll: !props.noScroll,
      state: props.state,
    });
  };
  // Hand-written equivalent of the compiled template()+spread() the upstream <A>
  // used: a real <a> with reactive href/class/aria-current/state and the rest
  // props passed through. Event handlers are read live at dispatch so a changed
  // handler prop is honored; onClick also runs the navigation interceptor (same
  // guards as @solidjs/router's delegated click listener).
  const el = document.createElement("a");
  insert(el, () => rest.children);
  /**
   * Invoke a Solid-style event handler (a function or `[fn, data]` tuple).
   *
   * @param {*} handler - The handler function or `[fn, data]` tuple.
   * @param {Event} evt - The event to pass.
   * @returns {void}
   */
  const callHandler = (handler, evt) => {
    if (typeof handler === "function") handler(evt);
    else if (Array.isArray(handler)) handler[0](handler[1], evt);
  };
  let clickBound = false;
  for (const key in rest) {
    if (key === "children" || key === "classList") continue;
    if (key.length > 2 && key[0] === "o" && key[1] === "n") {
      const type = key.slice(2).toLowerCase();
      if (key === "onClick") {
        clickBound = true;
        el.addEventListener("click", evt => { callHandler(rest.onClick, evt); navigateOnClick(evt); });
      } else {
        el.addEventListener(type, evt => callHandler(rest[key], evt));
      }
    }
  }
  if (!clickBound) el.addEventListener("click", navigateOnClick);
  let pHref, pClass, pAria, pState;
  createRenderEffect(() => {
    const href = to() || props.href;
    if (href !== pHref) { pHref = href; if (href == null) el.removeAttribute("href"); else el.setAttribute("href", href); }
    const list = {
      ...(props.class && { [props.class]: true }),
      [props.inactiveClass]: !isActive()[0],
      [props.activeClass]: isActive()[0],
      ...rest.classList,
    };
    const cls = Object.keys(list).filter(k => list[k]).join(" ");
    if (cls !== pClass) { pClass = cls; el.className = cls; }
    const aria = isActive()[1] ? "page" : undefined;
    if (aria !== pAria) { pAria = aria; if (aria == null) el.removeAttribute("aria-current"); else el.setAttribute("aria-current", aria); }
    const state = props.state === undefined ? undefined : JSON.stringify(props.state);
    if (state !== pState) { pState = state; if (state == null) el.removeAttribute("state"); else el.setAttribute("state", state); }
  });
  return el;
}

export {
  A,
  createMemoryHistory,
  MemoryRouter,
  Navigate,
  Route,
  Router,
  useIsRouting,
  useLocation,
  useNavigate,
  useParams,
  useResolvedPath,
  useSearchParams,
};
