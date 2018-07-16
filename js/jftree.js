import { JF as FBSTree } from "./JFTree_generated.js";
import { JF as FBSBlob } from "./JFBlob_generated.js";

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

const { Tree: JFTree } = FBSTree;
const { Blob: JFBlob } = FBSBlob;

const { BlobFlag, BlobTag, TagNumber, TagString } = JFBlob;

const Sequence = BlobFlag.Ordered | BlobFlag.Group;

const Float = BlobFlag.Numeric;
const Int = BlobFlag.Numeric | BlobFlag.Whole;
const UInt = BlobFlag.Unbiased | BlobFlag.Numeric | BlobFlag.Whole;

const Vector = {
  UInt: {
    8: UInt | (TagNumber.UInt8 << BlobTag.BITSHIFT) | Sequence,
    16: UInt | (TagNumber.UInt16 << BlobTag.BITSHIFT) | Sequence,
    32: UInt | (TagNumber.UInt32 << BlobTag.BITSHIFT) | Sequence,
    64: UInt | (TagNumber.UInt64 << BlobTag.BITSHIFT) | Sequence
  },

  Int: {
    8: Int | (TagNumber.Int8 << BlobTag.BITSHIFT) | Sequence,
    16: Int | (TagNumber.Int16 << BlobTag.BITSHIFT) | Sequence,
    32: Int | (TagNumber.Int32 << BlobTag.BITSHIFT) | Sequence,
    64: Int | (TagNumber.Int64 << BlobTag.BITSHIFT) | Sequence
  },

  Float: {
    32: Float | (TagNumber.Float32 << BlobTag.BITSHIFT) | Sequence,
    64: Float | (TagNumber.Float64 << BlobTag.BITSHIFT) | Sequence
  }
};

const Unit = {
  UTF8: BlobFlag.Text | (TagString.UTF8 << BlobTag.BITSHIFT)
};

const codecE = new TextEncoder();
const codecD = new TextDecoder();

const INIT_BRANCH_BSIZE = 1024;
const INIT_LEAF_BSIZE = 2048;

const MIN_SIZE = 1 << 3;
const MAX_SIZE = (MIN_SIZE << 1) - 1;

function sumWidths(totals, node, index) {
  const subtotal = index ? totals[index - 1] : 0;
  totals.push(subtotal + node.stem.width().toFloat64());
  return totals;
}

class TreeNode {
  constructor(raw = new Uint8Array([]), nodes = null) {
    const { fbs } = LIB;
    const { TreeStem } = JFTree;

    this.raw = raw;
    this.stem = TreeStem.getRootAsTreeStem(new fbs.ByteBuffer(raw));

    this.nodes = Array.isArray(nodes) ? nodes : null;
    this.totals = !this.nodes ? null : this.nodes.reduce(sumWidths, []);
  }
}

function bisect(count) {
  return (count >> 1) + 1;
}

function placeOf(at, node) {
  const count = at < 0 ? node.totals.length : 0;

  for (let index = 0; index < count; index += 1) {
    if (at < node.totals[index]) {
      return index;
    }
  }

  return -1;
}

function moduLong(low, high) {
  const { fbs } = LIB;
  let remainder = low;
  let quotient = high;

  while (remainder < 0) {
    remainder += ~0 >>> 0;
    quotient -= 1;
  }

  while (remainder > ~0 >>> 0) {
    remainder -= ~0 >>> 0;
    quotient += 1;
  }

  return fbs.Long.create(remainder, quotient);
}

function assembleUbytesBlob(builder, ubytes) {
  const { TreeDatum } = JFTree;

  return TreeDatum.createBlobVector(builder, ubytes);
}

function assembleBufferBlob(builder, buffer, offset, size) {
  const { TreeDatum } = JFTree;

  return TreeDatum.createBlobVector(
    builder,
    new Uint8Array(buffer, offset, size)
  );
}

function assembleViewBlob(builder, view) {
  return assembleBufferBlob(
    builder,
    view.buffer,
    view.byteOffset,
    view.byteLength
  );
}

function assembleArrayBlob(builder, list, flag) {
  if (0 === (flag & BlobFlag.Freeform)) {
    switch (flag) {
      case Vector.UInt[8]:
        return assembleUbytesBlob(builder, list);
      case Vector.Int[8]:
        return assembleViewBlob(builder, new Int8Array(list));

      case Vector.UInt[16]:
        return assembleViewBlob(builder, new Uint16Array(list));
      case Vector.Int[16]:
        return assembleViewBlob(builder, new Int16Array(list));

      case Vector.UInt[32]:
        return assembleViewBlob(builder, new Uint32Array(list));
      case Vector.Int[32]:
        return assembleViewBlob(builder, new Int32Array(list));

      case Vector.Float[32]:
        return assembleViewBlob(builder, new Float32Array(list));
      case Vector.Float[64]:
        return assembleViewBlob(builder, new Float64Array(list));
      default:
        break;
    }
  }

  if (list.every(Number.isInteger)) {
    const min = list.reduce(Math.min, 0);
    const max = list.reduce(Math.max, 0);
    const abs = -(min + 1) < max ? max : -(min + 1);
    const sign = min < 0 ? 1 : 0;

    if (abs < 0xff >>> sign) {
      return sign
        ? assembleViewBlob(builder, new Int8Array(list))
        : assembleUbytesBlob(builder, list);
    } else if (abs < 0xffff >>> sign) {
      return sign
        ? assembleViewBlob(builder, new Int16Array(list))
        : assembleUbytesBlob(builder, new Uint16Array(list));
    } else if (abs < 0xffffffff >>> sign) {
      return sign
        ? assembleViewBlob(builder, new Int32Array(list))
        : assembleUbytesBlob(builder, new Uint32Array(list));
    } else {
      return assembleViewBlob(builder, new Float64Array(list));
    }
  } else {
    return assembleViewBlob(builder, new Float64Array(list));
  }
}

function assembleTextBlob(builder, text) {
  const { TreeDatum } = JFTree;

  return TreeDatum.createBlobVector(builder, codecE.encode(text));
}

function assembleBlob(builder, blob, flag) {
  if (blob instanceof Uint8Array) {
    return assembleUbytesBlob(builder, blob);
  } else if (ArrayBuffer.isView(blob)) {
    return assembleViewBlob(builder, blob);
  } else if (Array.isArray(blob)) {
    return assembleArrayBlob(builder, blob, flag);
  } else if ("string" === typeof blob) {
    return assembleTextBlob(builder, blob);
  } else if (blob instanceof ArrayBuffer) {
    return assembleBufferBlob(builder, blob);
  } else {
    throw new Error(`Unresolved blob value: ${blob}`);
  }
}

function determineArrayBlobFlag(list) {
  if (list.every(Number.isInteger)) {
    const min = list.reduce(Math.min, 0);
    const max = list.reduce(Math.max, 0);
    const abs = -(min + 1) < max ? max : -(min + 1);
    const sign = min < 0 ? 1 : 0;

    if (abs < 0xff >>> sign) {
      return sign ? Vector.Int[8] : Vector.UInt[8];
    } else if (abs < 0xffff >>> sign) {
      return sign ? Vector.Int[16] : Vector.UInt[16];
    } else if (abs < 0xffffffff >>> sign) {
      return sign ? Vector.Int[32] : Vector.UInt[32];
    } else {
      return Vector.Float[64];
    }
  } else {
    return Vector.Float[64];
  }
}

function determineViewBlobFlag(name) {
  switch (name) {
    case "Uint8ClampedArray":
    case "Uint8Array":
      return Vector.UInt8;
    case "Uint16Array":
      return Vector.UInt16;
    case "Uint32Array":
      return Vector.UInt32;
    case "Int8Array":
      return Vector.Int8;
    case "Int16Array":
      return Vector.Int16;
    case "Int32Array":
      return Vector.Int32;
    case "Float32Array":
      return Vector.Float32;
    case "Float64Array":
      return Vector.Float64;
    default:
      throw new Error(`Unrecognized view name: ${name}`);
  }
}

function determineBlobFlag(blob) {
  if (ArrayBuffer.isView(blob)) {
    return determineViewBlobFlag(blob.constructor.name);
  } else if (Array.isArray(blob)) {
    return determineArrayBlobFlag(blob);
  } else if ("string" === typeof blob) {
    return Unit.UTF8;
  } else if (blob instanceof ArrayBuffer) {
    return Sequence;
  } else {
    return 0;
  }
}

function assembleDatum(builder, tag, label, blob) {
  const { TreeDatum } = JFTree;

  const flag = tag & BlobFlag.Freeform || determineBlobFlag(blob);
  const bOffset = assembleBlob(builder, blob, flag);
  const lOffset = label ? builder.createString(label) : 0;

  TreeDatum.startTreeDatum(builder);

  TreeDatum.addTag(builder, tag | flag);

  if (label) {
    TreeDatum.addLabel(builder, lOffset);
  }

  TreeDatum.addBlob(bOffset);

  return endTreeDatum(builder);
}

function replicateDatum(builder, datum) {
  const label = datum.label() || "";
  return assembleDatum(builder, datum.tag(), label, datum.blobArray());
}

function assembleStem(builder, keys, vals, refs, prior, next, width, height) {
  const { fbs } = LIB;
  const { Unique, TreeStem } = JFTree;

  TreeStem.startTreeStem(builder);

  TreeStem.addUnique(
    builder,
    Unique.createUnique(builder, fbs.Long.create(0, 0), fbs.Long.create(0, 0))
  );
  TreeStem.addKeys(builder, keys);
  TreeStem.addVals(builder, vals);
  TreeStem.addRefs(builder, refs);
  TreeStem.addPrior(builder, prior);
  TreeStem.addNext(builder, next);
  TreeStem.addCommit(builder, fbs.Long.create(0, 0));
  TreeStem.addMerge(builder, fbs.Long.create(0, 0));
  TreeStem.addWidth(builder, width);
  TreeStem.addHeight(builder, height);

  return TreeStem.endTreeStem(builder);
}

function growLeaf(bsize = 0) {
  const { fbs } = LIB;
  const { TreeStem } = JFTree;

  const builder = new fbs.Builder(bsize);

  const height = 0;

  const keys = TreeStem.createKeysVector(builder, []);

  const vals = TreeStem.createValsVector(builder, []);

  TreeStem.startRefsVector(builder, 0);
  const refs = builder.endVector();

  builder.finish(
    assembleStem(
      builder,
      keys,
      vals,
      refs,
      builder.createString(""),
      builder.createString(""),
      fbs.Long.create(0, 0),
      height
    )
  );

  return new TreeNode(builder.asUint8Array(), null);
}

function growRoot(lower, upper, bsize = 0) {
  const { fbs } = LIB;
  const { Unique, TreeStem } = JFTree;

  const builder = new fbs.Builder(bsize);

  const height =
    lower.stem.height() > upper.stem.height()
      ? lower.stem.height() + 1
      : upper.stem.height() + 1;

  const keys = TreeStem.createKeysVector(builder, [
    builder.createString(lower.stem.keys(0)),
    builder.createString(upper.stem.keys(0))
  ]);

  const vals = TreeStem.createValsVector(builder, []);

  TreeStem.startRefsVector(builder, 2);
  Unique.createUnique(
    builder,
    lower.stem.unique().instance(),
    lower.stem.unique().allocator()
  );
  Unique.createUnique(
    builder,
    upper.stem.unique().instance(),
    upper.stem.unique().allocator()
  );
  const refs = builder.endVector();

  builder.finish(
    assembleStem(
      builder,
      keys,
      vals,
      refs,
      builder.createString(""),
      builder.createString(""),
      moduLong(
        lower.stem.width().low + upper.stem.width().low,
        lower.stem.width().high + upper.stem.width().high
      ),
      height
    )
  );

  return new TreeNode(builder.asUint8Array(), [lower, upper]);
}

function sliceInsertVals(builder, model, place, limit, at, tag, label, blob) {
  const { TreeStem, TreeDatum } = JFTree;

  const datum = new TreeDatum();
  const vals = [];

  for (let index = place; index < at; index += 1) {
    vals.push(replicateDatum(model.vals(index, datum)));
  }

  {
    vals.push(assembleDatum(builder, tag, label, blob));
  }

  for (let index = at; index < limit; index += 1) {
    vals.push(replicateDatum(model.vals(index, datum)));
  }

  return TreeStem.createValsVector(builder, vals);
}

function sliceInsertKeys(builder, model, place, limit, at, key) {
  const { TreeStem } = JFTree;

  const keys = [];

  for (let index = place; index < at; index += 1) {
    keys.push(builder.createString(model.keys(index)));
  }

  {
    keys.push(builder.createString(key));
  }

  for (let index = at; index < limit; index += 1) {
    keys.push(builder.createString(model.keys(index)));
  }

  return TreeStem.createKeysVector(builder, keys);
}

function lSliceInsert(builder, model, place, limit, at, key, tag, label, blob) {
  return assembleStem(
    builder,
    sliceInsertKeys(builder, model, place, limit, at, key),
    sliceInsertVals(builder, model, place, limit, at, tag, label, blob),
    sliceRefs(builder, model, -1, -1),
    builder.createString(model.prior()),
    builder.createString(model.next()),
    model.width(),
    model.height()
  );
}

function chainNext(next, front) {
  const { fbs } = LIB;

  const bsize = 2 * front.raw.length;
  const amount = Array.isArray(front.nodes) ? front.nodes.length : 0;

  if (amount === 0) {
    const builder = new fbs.Builder(bsize);

    builder.finish(copyLeafWithNext(builder, front.stem, next));

    return new TreeNode(builder.asUint8Array(), null);
  } else {
    const child = chainNext(next, front.nodes[amount - 1]);
    const list = front.nodes.slice();

    const builder = new fbs.Builder(bsize);

    builder.finish(copyBranchWithNext(builder, front.stem, next, child));

    list[amount - 1] = child;

    return new TreeNode(builder.asUint8Array(), list);
  }
}

function chainPrior(prior, rear) {
  const { fbs } = LIB;

  const bsize = 2 * rear.raw.length;
  const amount = Array.isArray(rear.nodes) ? rear.nodes.length : 0;

  if (amount === 0) {
    const builder = new fbs.Builder(bsize);

    builder.finish(copyLeafWithPrior(builder, rear.stem, prior));

    return new TreeNode(builder.asUint8Array(), null);
  } else {
    const child = chainPrior(prior, rear.nodes[0]);
    const list = rear.nodes.slice();

    const builder = new fbs.Builder(bsize);

    builder.finish(copyBranchWithPrior(builder, rear.stem, prior, child));

    list[0] = child;

    return new TreeNode(builder.asUint8Array(), list);
  }
}

function includeLeaf(place, nodes, key, tag, label, blob, bsize = 0) {
  const { fbs } = LIB;

  const { original } = nodes;
  const model = original.stem;
  const count = model.keysLength();

  const builder = new fbs.Builder(bsize);

  builder.finish(
    lSliceInsert(builder, model, 0, count, place, key, tag, label, blob)
  );

  nodes.lower = new TreeNode(builder.asUint8Array(), null);
  nodes.upper = nodes.lower;
}

function includeLessLeaf(place, nodes, key, tag, label, blob, bsize = 0) {
  const { fbs } = LIB;

  const { original } = nodes;
  const model = original.stem;
  const count = model.keysLength();
  const split = bisect(count);
  const prior = place === split - 1 ? key : model.keys(split - 1);

  const former = new fbs.Builder(bsize);
  const latter = new fbs.Builder(bsize);

  former.finish(
    lSliceInsert(former, model, 0, split, place, key, tag, label, blob)
  );

  latter.finish(sliceLeavesWithPrior(latter, model, split, count, prior));

  nodes.lower = new TreeNode(former.asUint8Array(), null);
  nodes.upper = new TreeNode(latter.asUint8Array(), null);
}

function includeMoreLeaf(place, nodes, key, tag, label, blob, bsize = 0) {
  const { fbs } = LIB;

  const { original } = nodes;
  const model = original.stem;
  const count = model.keysLength();
  const split = bisect(count);
  const next = place === split ? key : model.keys(split);

  const former = new fbs.Builder(bsize);
  const latter = new fbs.Builder(bsize);

  former.finish(sliceLeavesWithNext(former, model, 0, split, next));

  latter.finish(
    lSliceInsert(latter, model, split, count, place, key, tag, label, blob)
  );

  nodes.lower = new TreeNode(former.asUint8Array(), null);
  nodes.upper = new TreeNode(latter.asUint8Array(), null);
}

function includeBranch(place, nodes, bsize = 0) {
  const { fbs } = LIB;

  const { original, lower, before, after } = nodes;
  const model = original.stem;
  const count = original.nodes.length;

  const first = [];

  const builder = new fbs.Builder(bsize);

  builder.finish(
    sliceSetBranches(
      builder,
      model,
      0,
      count,
      place,
      lower,
      before,
      after,
      original.nodes,
      first
    )
  );

  nodes.lower = new TreeNode(builder.asUint8Array(), first);
  nodes.upper = nodes.lower;
}

function includeDualBranch(place, nodes, bsize = 0) {
  const { fbs } = LIB;

  const { original, lower, upper, before, after } = nodes;
  const model = original.stem;
  const count = original.nodes.length;

  const first = [];

  const builder = new fbs.Builder(bsize);

  builder.finish(
    sliceInsertBranches(
      builder,
      model,
      0,
      count,
      place,
      lower,
      upper,
      before,
      after,
      original.nodes,
      first
    )
  );

  nodes.lower = new TreeNode(builder.asUint8Array(), first);
  nodes.upper = nodes.lower;
}

function includeEqualBranch(place, nodes, bsize = 0) {
  const { fbs } = LIB;

  const { original, lower, upper, before, after } = nodes;
  const model = original.stem;
  const count = original.nodes.length;

  const first = [];
  const second = [];

  const former = new fbs.Builder(bsize);
  const latter = new fbs.Builder(bsize);

  former.finish(
    sliceSetBranches(
      former,
      model,
      0,
      place + 1,
      place,
      lower,
      before,
      null,
      original.nodes,
      first
    )
  );

  latter.finish(
    sliceSetBranches(
      latter,
      model,
      count - place - 1,
      count,
      count - place - 1,
      upper,
      null,
      after,
      original.nodes,
      second
    )
  );

  nodes.lower = new TreeNode(former.asUint8Array(), first);
  nodes.upper = new TreeNode(latter.asUint8Array(), upper);
}

function includeLessBranch(place, nodes, bsize = 0) {
  const { fbs } = LIB;

  const { original, lower, upper, before, after } = nodes;
  const model = original.stem;
  const count = original.nodes.length;
  const split = bisect(count);

  const first = [];
  const second = [];

  const former = new fbs.Builder(bsize);
  const latter = new fbs.Builder(bsize);

  former.finish(
    sliceInsertBranches(
      former,
      model,
      0,
      split,
      place,
      lower,
      upper,
      before,
      after,
      original.nodes,
      first
    )
  );

  latter.finish(
    sliceSetBranches(
      latter,
      model,
      split,
      count,
      place,
      upper,
      null,
      after,
      original.nodes,
      second
    )
  );

  nodes.lower = new TreeNode(former.asUint8Array(), first);
  nodes.upper = new TreeNode(latter.asUint8Array(), second);
}

function includeMoreBranch(place, nodes, bsize = 0) {
  const { fbs } = LIB;

  const { original, lower, upper, before, after } = nodes;
  const model = original.stem;
  const count = original.nodes.length;
  const split = bisect(count);

  const first = [];
  const second = [];

  const former = new fbs.Builder(bsize);
  const latter = new fbs.Builder(bsize);

  former.finish(
    sliceSetBranches(
      former,
      model,
      0,
      split,
      place,
      lower,
      before,
      null,
      original.nodes,
      first
    )
  );

  latter.finish(
    sliceInsertBranches(
      latter,
      model,
      split,
      count,
      place,
      lower,
      upper,
      before,
      after,
      original.nodes,
      second
    )
  );

  nodes.lower = new TreeNode(former.asUint8Array(), first);
  nodes.upper = new TreeNode(latter.asUint8Array(), second);
}

class TreeTrunk {
  constructor(
    root = null,
    min = MIN_SIZE,
    max = MAX_SIZE,
    leafsize = INIT_LEAF_BSIZE,
    branchsize = INIT_BRANCH_BSIZE
  ) {
    const floor = min < max ? min : max;
    const ceil = max > min ? max : min;

    this._min = floor < 1 ? MIN_SIZE : floor;
    this._max = ceil < 2 ? MAX_SIZE : ceil;

    this._leafsize = leafsize < 0 ? INIT_LEAF_BSIZE : branchsize;
    this._branchsize = branchsize < 0 ? INIT_BRANCH_BSIZE : branchsize;

    this._root = root || growLeaf(this._leafsize);
  }

  rebase(origin) {
    // TODO(jfinity): implement merge behavior
  }

  join(origin) {
    // TODO(jfinity): implement merge behavior
  }

  fork() {
    return new TreeTrunk(
      this._root,
      this._min,
      this._max,
      this._leafsize,
      this._branchsize
    );
  }

  size(root = this._root) {
    return root.stem.height() < 1
      ? root.stem.keysLength()
      : root.totals[root.totals.length - 1];
  }

  encode(text = "") {
    return codecE.encode(text);
  }

  decode(blob = new Uint8Array([])) {
    return codecD.decode(blob);
  }

  valueOf(index = -1, root = this._root) {
    return this._read(index, root);
  }

  get(key = "", skip = -1, root = this._root) {
    const index = this.head(key, skip, root);

    return index < 0 ? undefined : this._read(index, root);
  }

  _read(at = -1, root = this._root) {
    // output blob
  }

  options(key = "", skip = -1, root = this._root) {
    // output blob "label-tag"
  }

  indexOf(key = "", root = this._root) {
    return this._find(key, root);
  }

  lastIndexOf(key = "", root = this._root) {
    return this._locate(key, root);
  }

  head(key = "", skip = -1, root = this._root) {
    const front = skip === -1 ? -1 : this._find(key, root);
    const back = skip === 0 ? -1 : this._locate(key, root);

    const at = skip < 0 ? back + 1 + skip : front + skip;

    // handle negative back/front

    return at < front ? front : at < back || back < 0 ? at : back;
  }

  _find(key = "", root = this._root) {
    // _find first
  }

  _locate(key = "", root = this._root) {
    // _locate last
  }

  _add(tag, label, blob, key, at, nodes, defer) {
    const { original, before, after } = nodes;

    if (original.stem.height() < 1) {
      const place = at;

      const count = original.stem.keysLength();

      if (count < this._max) {
        includeLeaf(place, nodes, key, tag, label, blob, this._leafsize);
      } else if (place < bisect(count)) {
        includeLessLeaf(place, nodes, key, tag, label, blob, this._leafsize);
      } else {
        includeMoreLeaf(place, nodes, key, tag, label, blob, this._leafsize);
      }
    } else {
      const place = placeOf(at, original);

      const index = place > 0 ? at - original.totals[place - 1] : at - 0;
      const fasten = index === 0 || at === original.totals[place];

      nodes.original = original.nodes[place];
      nodes.before = place ? original.nodes[place - 1] : null;
      nodes.after =
        place < original.node.length - 1 ? original.nodes[place + 1] : null;
      nodes.lower = null;
      nodes.upper = null;

      this._add(tag, label, blob, key, index, nodes, defer || fasten);

      nodes.original = original;
      nodes.before = before;
      nodes.after = after;

      if (!defer && fasten) {
        if (index === 0) {
          nodes.before = chainNext(nodes.lower.stem.keys(0), before);
        } else {
          nodes.after = chainPrior(
            nodes.upper.stem.keys(nodes.upper.stem.keysLength() - 1),
            after
          );
        }
      }

      const count = original.totals.length;

      if (nodes.lower === nodes.upper) {
        includeBranch(place, nodes, this._branchsize);
      } else if (count < this._max) {
        includeDualBranch(place, nodes, this._branchsize);
      } else if (place === bisect(count) - 1) {
        includeEqualBranch(place, nodes, this._branchsize);
      } else if (place < bisect(count)) {
        includeLessBranch(place, nodes, this._branchsize);
      } else {
        includeMoreBranch(place, nodes, this._branchsize);
      }
    }
  }

  _write(root, tag = 0, label = "", blob = [], key = "", skip = -1) {
    const at = this.head(key, skip);

    const index = at < 0 ? -1 - at : at;
    const fasten = index === 0 || index === root.totals[count - 1];

    const nodes = {
      original: this._root || null,
      before: null,
      lower: null,
      upper: null,
      after: null
    };

    this._add(tag, label, blob, key, index, nodes, fasten);

    return nodes.lower === nodes.upper
      ? nodes.lower
      : growRoot(nodes.lower, nodes.upper, this._branchsize);
  }

  patch(root, tag = 0, label = "", blob = "", key = "", skip = -1) {
    return this._write(root, tag, label, blob, key, skip);
  }

  put(tag = 0, label = "", blob = new Uint8Array([]), key = "", skip = -1) {
    this._root = this._write(this._root, tag, label, blob, key, skip);

    return this;
  }

  _subtract(at, nodes) {
    // counterpart to _add
  }

  _erase(root, key = "", skip = -1) {
    // counterpart to _write
  }

  unset(root, key = "", skip = -1) {
    return this._erase(root, key, skip);
  }

  delete(key = "", skip = -1) {
    this._root = this._erase(this._root, key, skip);

    return this;
  }

  clear() {
    this._root = growLeaf();

    return this;
  }
}

export default function API() {
  const { JFTree = {} } = LIB;
  const { Unique, TreeStem, TreeDatum } = JFTree;

  return {
    POLYFILL,

    Trunk: TreeTrunk,
    Node: TreeNode,

    Ego: Unique,
    Datum: TreeDatum,
    Stem: TreeStem
  };
}

ENV.jftree = API;

const {
  Trunk: $$Trunk,
  Node: $$Node,

  Ego: $$Ego,
  Datum: $$Datum,
  Stem: $$Stem
} = API();

export {
  POLYFILL,
  $$Trunk as Trunk,
  $$Node as Node,
  $$Ego as Ego,
  $$Datum as Datum,
  $$Stem as Stem
};
