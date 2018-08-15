// Join-Fork Tree

const ENV = (that => this || that)(
  "undefined" !== typeof window ? window || {} : {}
);

const LIB = {
  fbs: ENV.flatbuffers
};

function POLYFILL({ fbs = LIB.fbs } = LIB) {
  LIB.fbs = fbs;
}

const naturalCollation = { locales: undefined, options: undefined };

const codecE = new TextEncoder();
const codecD = new TextDecoder();

const LEAF_HEIGHT = 0;

const MIN_SIZE = 1 << 3;
const MAX_SIZE = (MIN_SIZE << 1) - 1;

function TJoint(version, basis, series) {
  return {
    version: +version || 0,
    basis: +basis || 0,
    series: series || ""
  };
}

function bisect(count) {
  return (count >> 1) + 1;
}

function clampTo(lower, upper, index) {
  if (index < lower) return lower;
  else if (index > upper) return upper;
  else return index;
}

function placeOfIndex(at, stem) {
  // TODO(jfinity): benchmark with binary search
  const count = at < 0 ? 0 : stem.offsets.length;

  for (let index = 0; index < count; index += 1) {
    if (at < stem.offsets[index]) {
      return index;
    }
  }

  return at < 0 ? -2 : -1;
}

function ascendKey(key, stem) {
  // TODO(jfinity): benchmark with binary search
  const { locales, options } = stem.collation || naturalCollation;
  const count = stem.stems ? stem.stems.length : stem.vals.length;

  for (let index = 0; index < count; index += 1) {
    const found = stem.stems ? stem.stems[index].upper : stem.vals[index].key;
    const bias = key.localeCompare(found, locales, options);

    if (bias > 0) continue;
    else return index;
  }

  return -1;
}

function descendKey(key, stem) {
  // TODO(jfinity): benchmark with binary search
  const { locales, options } = stem.collation || naturalCollation;
  const count = stem.stems ? stem.stems.length : stem.vals.length;

  for (let index = count; index-- > 0; ) {
    const found = stem.stems ? stem.stems[index].lower : stem.vals[index].key;
    const bias = key.localeCompare(found, locales, options);

    if (bias < 0) continue;
    else return index;
  }

  return -2;
}

function normalize(key) {
  switch (typeof key) {
    case "string":
      return key;
    case "number":
      return key.toString();
    default:
      throw new Error(`Failed to normalize key: ${key}`);
  }
}

function TVal(key, data, joint) {
  return {
    key: normalize(key) || "",
    data: data,
    joint: joint || null
  };
}

function isLeafy(branch) {
  return !branch.stems;
}

function sumLeaves(offsets, stem, index) {
  const width = stem.vals.length;
  const total = index ? offsets[index - 1] : 0;

  offsets.push(total + width);

  return offsets;
}

function sumBranches(offsets, stem, index) {
  const count = stem.offsets.length;
  const width = count ? stem.offsets[count - 1] : 0;
  const total = index ? offsets[index - 1] : 0;

  offsets.push(total + width);

  return offsets;
}

function TStem(height, collation, stems, vals, joint, ego, gauges) {
  const limit = vals ? vals.length : 0;
  const amount = stems ? stems.length : 0;

  return {
    height: height || LEAF_HEIGHT,

    collation: collation || null,

    lower: stems
      ? (amount || null) && stems[0].lower
      : (limit || null) && vals[0].key,
    upper: stems
      ? (amount || null) && stems[amount - 1].upper
      : (limit || null) && vals[limit - 1].key,

    vals: vals || null,
    stems: stems || null,
    offsets: stems
      ? stems.reduce(!stems.every(isLeafy) ? sumBranches : sumLeaves, [])
      : null,

    ego: ego || "",
    joint: joint || null,
    gauges: gauges || null
  };
}

function lSlicePart(stem, begin, end, joint) {
  const { height, collation, vals } = stem;
  const list = vals.slice(begin, end);

  return TStem(height, collation, null, list, joint, "", null);
}

function lSliceSet(stem, begin, end, index, value) {
  const { height, collation, vals } = stem;
  const middle = clampTo(0, vals.length - 1, index);
  const list = vals.slice(begin, end);

  list[middle] = value;

  return TStem(height, collation, null, list, value.joint, "", null);
}

function lSliceInsert(stem, begin, end, index, value) {
  const { height, collation, vals } = stem;
  const middle = clampTo(0, vals.length, index);
  const list = [];

  for (let at = begin; at < middle; at += 1) list.push(vals[at]);

  list.push(value);

  for (let at = middle; at < end; at += 1) list.push(vals[at]);

  return TStem(height, collation, null, list, value.joint, "", null);
}

function includeLeaf(at, nodes, value) {
  const count = nodes.original.vals.length;

  nodes.lower = lSliceSet(nodes.original, 0, count, at, value);
  nodes.upper = nodes.lower;
}

function includeExtraLeaf(at, nodes, value) {
  const count = nodes.original.vals.length;

  nodes.lower = lSliceInsert(nodes.original, 0, count, at, value);
  nodes.upper = nodes.lower;
}

function includeLessLeaf(at, nodes, value) {
  const size = nodes.original.vals.length;
  const half = bisect(size);

  nodes.lower = lSliceInsert(nodes.original, 0, half, at, value);
  nodes.upper = lSlicePart(nodes.original, half, size, value.joint);
}

function includeMoreLeaf(at, nodes, value) {
  const size = nodes.original.vals.length;
  const half = bisect(size);

  nodes.lower = lSlicePart(nodes.original, 0, half, value.joint);
  nodes.upper = lSliceInsert(nodes.original, half, size, at, value);
}

function bSliceSet(parent, begin, end, index, node) {
  const { height, collation, stems } = parent;
  const list = stems.slice(begin, end);

  list[index] = node;

  return TStem(height, collation, list, null, node.joint, "", null);
}

function bSliceInsert(parent, begin, end, index, younger, older) {
  const { height, collation, stems } = parent;
  const list = [];

  for (let at = begin; at < index; at += 1) list.push(stems[at]);

  list.push(younger);
  list.push(older);

  for (let at = index + 1; at < end; at += 1) list.push(stems[at]);

  return TStem(height, collation, list, null, younger.joint, "", null);
}

function includeBranch(place, nodes) {
  const { original, lower } = nodes;
  const count = original.stems.length;

  nodes.lower = bSliceSet(original, 0, count, place, lower);
  nodes.upper = nodes.lower;
}

function includeExtraBranch(place, nodes) {
  const { original, lower, upper } = nodes;
  const count = original.stems.length;

  nodes.lower = bSliceInsert(original, 0, count, place, lower, upper);
  nodes.upper = nodes.lower;
}

function includeDualBranch(place, nodes) {
  const { original, lower, upper } = nodes;
  const count = original.stems.length;
  const index = count - place - 1;

  nodes.lower = bSliceSet(original, 0, place + 1, place, lower);
  nodes.upper = bSliceSet(original, index, count, index, upper);
}

function includeLessBranch(place, nodes) {
  const { original, lower, upper } = nodes;
  const count = original.stems.length;
  const split = bisect(count);

  nodes.lower = bSliceInsert(original, 0, split, place, lower, upper);
  nodes.upper = bSliceSet(original, split, count, place, upper);
}

function includeMoreBranch(place, nodes) {
  const { original, lower, upper } = nodes;
  const count = original.stems.length;
  const split = bisect(count);

  nodes.lower = bSliceSet(original, 0, split, place, lower);
  nodes.upper = bSliceInsert(original, split, count, place, lower, upper);
}

function growLeaf(collation = null, val = null, joint = null) {
  const height = LEAF_HEIGHT;

  return TStem(height, collation, null, val ? [val] : [], joint, "", null);
}

function growRoot(node, stems, joint = null) {
  const { height, collation } = node;
  const list =
    stems && stems.length ? stems : [growLeaf(collation, null, joint)];

  return TStem(height + 1, collation, list, null, joint, "", null);
}

function _measure(node) {
  return isLeafy(node)
    ? node.vals.length
    : node.offsets[node.offsets.length - 1];
}

function _search(node, key = "", descending = false) {
  if (isLeafy(node)) {
    const limit = node.vals.length;
    const temp = descending ? descendKey(key, node) : ascendKey(key, node);

    if (temp < 0) return temp === -1 ? -1 : -limit - 1;
    else if (key === node.vals[temp].key) return temp;
    else return descending ? -limit - 1 + temp + 1 : -limit - 1 + temp;
  } else {
    const limit = node.offsets.length;
    const temp = descending ? descendKey(key, node) : ascendKey(key, node);
    const at = temp === -1 ? limit : clampTo(0, limit - 1, temp);
    const index =
      at < limit
        ? _search(node.stems[at], key, descending)
        : -node.offsets[at - 1];

    if (index > -1) return at > 0 ? node.offsets[at - 1] + index : index;
    else if (at >= limit) return -1;
    else return -node.offsets[limit - 1] - 1 + node.offsets[at] + 1 + index;
  }
}

function _find(node, key = "") {
  const DESCENDING = true;
  return _search(node, key, !DESCENDING);
}

function _locate(node, key = "") {
  const DESCENDING = true;
  return _search(node, key, DESCENDING);
}

function _onset(node, key = "", skip = 0) {
  const total = _measure(node);
  const move = clampTo(-total - 1, total, skip);
  const first = move < -2 || move > 0 ? _find(node, key) : -1;
  const last = first < 0 && move !== -1 ? first : _locate(node, key);

  if (move === 0) return _find(node, key);
  else if (move === -1) return last < 0 ? last : -total - 1 + last + 1;
  else if (move === -2) return _locate(node, key);
  else if (first < 0) return first;
  else if (last < 0) return last;
  else if (move < 0) {
    if (last + 2 + move < first) return -total - 1 + first;
    else return last + 2 + move;
  } else {
    if (first + move > last) return -total - 1 + last + 1;
    else return first + move;
  }
}

function _val(node, at) {
  if (isLeafy(node)) {
    const limit = node.vals.length;

    if (limit > 0) return node.vals[clampTo(0, limit - 1, at)];
    else return null;
  } else {
    const limit = node.offsets.length;
    const temp = placeOfIndex(at, node);
    const place = temp === -1 ? limit - 1 : clampTo(0, limit - 1, temp);
    const index = place > 0 ? at - node.offsets[place - 1] : at - 0;

    return _val(node.stems[place], index);
  }
}

function _read(node, index = -2) {
  const at = index < 0 ? _measure(node) + 1 + index : index;

  return _val(node, at) || null;
}

function _hold(value, at, swap, max, nodes) {
  if (isLeafy(nodes.original)) {
    const limit = nodes.original.vals.length;
    const index = clampTo(0, swap ? limit - 1 : limit, at);

    if (swap) includeLeaf(index, nodes, value);
    else if (limit < max) includeExtraLeaf(index, nodes, value);
    else if (index < bisect(limit)) includeLessLeaf(index, nodes, value);
    else includeMoreLeaf(index, nodes, value);
  } else {
    const { original } = nodes;
    const limit = original.offsets.length;
    const temp = placeOfIndex(at, original);
    const place = temp === -1 ? limit - 1 : clampTo(0, limit - 1, temp);
    const index = place > 0 ? at - original.offsets[place - 1] : at - 0;

    nodes.original = original.stems[place];
    nodes.lower = nodes.original;
    nodes.upper = nodes.original;

    _hold(value, index, swap, max, nodes);

    nodes.original = original;

    if (nodes.lower === nodes.upper) includeBranch(place, nodes);
    else if (limit < max) includeExtraBranch(place, nodes);
    else if (place === bisect(limit) - 1) includeDualBranch(place, nodes);
    else if (place < bisect(limit)) includeLessBranch(place, nodes);
    else includeMoreBranch(place, nodes);
  }

  return nodes;
}

function _write(root, value, index = -1, max = MAX_SIZE) {
  const total = _measure(root);
  const swap = index < 0 ? 0 : 1;
  const at = index < 0 ? total + 1 + index : index;

  const nodes = {
    lower: root,
    upper: root,
    original: root
  };

  // TODO(jfinity): avoid rebalancing when "appending" or "prepending"

  _hold(value, at, swap, max, nodes);

  return nodes.lower === nodes.upper
    ? nodes.lower
    : growRoot(root, [nodes.lower, nodes.upper], value.joint);
}

function _drop(at, original, lower, upper, joint) {
  // TODO(jfinity): counterpart to _hold
}

function _erase(root, index = -2, joint = null, min = MIN_SIZE) {
  // TODO(jfinity): counterpart to _write
}

class TTrunk {
  constructor(root, collation, min, max) {
    const { locales, options } =
      (root ? root.collation : collation) || naturalCollation;

    const floor = 0 | (min < 0) | max ? 0 | min : 0 | max;
    const ceil = 0 | (max > 0) | min ? 0 | max : 0 | min;

    this._min = floor < 1 ? MIN_SIZE : floor;
    this._max = ceil < 2 ? MAX_SIZE : ceil;

    this._root =
      root || growLeaf(collation ? { locales, options } : null, null, null);
  }

  toJSON() {
    return {
      min: this._min,
      max: this._max,
      root: this._root || null
    };
  }

  encode(text = "") {
    return codecE.encode.apply(codecE, arguments);
  }

  decode(data = new Uint8Array()) {
    return codecD.decode.apply(codecD, arguments);
  }

  wrap(root = this._root) {
    const node = this._root;

    this._root = root || node;

    return node;
  }

  size() {
    return _measure(this._root);
  }

  offsetOf(key = "", skip = 0) {
    return _onset(this._root, normalize(key), skip);
  }

  indexOf(key = "") {
    return _find(this._root, normalize(key));
  }

  lastIndexOf(key = "") {
    return _locate(this._root, normalize(key));
  }

  valueOf(index = -2) {
    const value = _read(this._root, index);

    return value ? value.data : undefined;
  }

  get(key = "", skip = 0) {
    const at = _onset(this._root, normalize(key), skip);
    const value = at < 0 ? null : _read(this._root, at);

    return value ? value.data : undefined;
  }

  has(key = "", skip = 0) {
    const at = _onset(this._root, normalize(key), skip);

    return at >= 0;
  }

  put(data = null, key = "", skip = -1, joint = null) {
    const value = TVal(normalize(key), data, joint);
    const at = _onset(this._root, value.key, skip);
    const index = at < 0 ? at : -_measure(this._root) - 1 + at;

    this._root = _write(this._root, value, index, this._max);

    return this;
  }

  assign(data = null, key = "", skip = 0, joint = null) {
    const value = TVal(normalize(key), data, joint);
    const at = _onset(this._root, value.key, skip);
    const index = at < -1 ? _measure(this._root) + 1 + at : at;

    this._root = _write(this._root, value, index, this._max);

    return this;
  }

  unset(key = "", skip = 0, joint = null) {
    const at = _onset(this._root, normalize(key), skip);

    this._root =
      at < 0 ? this._root : _erase(this._root, at, joint, this._min);

    return this;
  }

  remove(index = -2, joint = null) {
    const total = _measure(this._root);
    const at = index < 0 ? total + 1 + index : index;

    this._root =
      at < 0 || at >= total
        ? this._root
        : _erase(this._root, at, joint, this._min);

    return this;
  }

  empty(joint = null) {
    this._root = growLeaf(this._root.collation, null, joint);

    return this;
  }

  set(key = "", data = null, joint = null, skip = 0) {
    this.assign(data, key, skip, joint);

    return this;
  }

  delete(key = "", joint = null, skip = 0) {
    const total = _measure(this._root);

    this.unset(key, skip, joint);

    return total > _measure(this._root);
  }

  clear(joint = null) {
    this.empty(joint);

    return undefined;
  }

  push() {
    const joint = null;
    const count = arguments.length;

    for (let index = 0; index < count; index += 1) {
      const value = TVal("", arguments[index], joint);

      this._root = _write(this._root, value, -1, this._max);
    }

    return _measure(this._root);
  }

  pop(joint = null) {
    const value = _read(this._root, -2) || null;

    this._root = _erase(this._root, -2, joint, this._min);

    return value ? value.data : undefined;
  }

  unshift() {
    const joint = null;
    const count = arguments.length;
    let total = _measure(this._root);

    for (let index = 0; index < count; index += 1) {
      const value = TVal("", arguments[index], joint);
      const at = -total - 1 - index;

      this._root = _write(this._root, value, at, this._max);
    }

    return _measure(this._root);
  }

  pop(joint = null) {
    const value = this._read(this._root, 0) || null;

    this._root = this._erase(this._root, 0, joint, this._min);

    return value ? value.data : undefined;
  }
}

class TFork {
  // TODO(jfinity): proxy TTrunk to collect queries for a Deltas (MVCC)
}

export default function API() {
  return {
    POLYFILL,

    TTrunk,
    TStem,
    TVal,

    normalize
  };
}

ENV.jftree = API;

const {
  POLYFILL: $$POLYFILL,

  TTrunk: $$TTrunk,
  TStem: $$TStem,
  TVal: $$TVal,

  normalize: $$normalize
} = API();

export {
  $$POLYFILL as POLYFILL,
  $$TTrunk as TTrunk,
  $$TStem as TStem,
  $$TVal as TVal,
  $$normalize as normalize
};
