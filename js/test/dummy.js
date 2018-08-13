import jftree from "../jftree.js";

const ENV = (that => this || that)(
  "undefined" !== typeof window ? window || {} : {}
);

const { TTrunk, TVal, normalize } = jftree();

function term(err) {
  debugger;
  throw err;
}

function shallowArrayEqual(alpha, beta) {
  const count = alpha.length;

  if (count !== beta.length) return false;
  else
    for (let index = 0; index < count; index += 1) {
      if (alpha[index] !== beta[index]) return false;
    }

  return true;
}

function write(value, at = -1) {
  const index = at < 0 ? this.size() + 1 + at : at;
  const vals = this._vals.slice();

  if (at < 0) vals.splice(index, 0, value);
  else vals[index] = value;

  if (!shallowArrayEqual(vals, vals.slice().sort(this._cmp))) {
    // TODO(jfinity): sorting is "unstable" with repeated keys
    term(new Error("Sort order violation"));
  }

  return vals;
}

function erase(at = -2, ignore = null) {}

class TDummy {
  constructor(vals = null, { locales, options } = {}) {
    const cmp = (alpha, beta) =>
      alpha.key.localeCompare(beta.key, locales, options);

    this._vals = (vals || []).slice().sort(cmp);

    this._cmp = cmp;
  }

  size() {
    return this._vals.length;
  }

  offsetOf(key = "", skip = 0) {
    const total = this.size();
    const first = this.indexOf(key);
    const last = this.lastIndexOf(key);

    if (last < 0 && last !== first) {
      term(new Error("Mismatched unfound"));
    }

    if (first < 0 && last !== first) {
      term(new Error("Mismatched unfound"));
    }

    if (first < 0) return first;
    else if (skip === -1) return -total - 1 + last + 1;
    else if (skip > -1) {
      if (first + skip > last) return -total - 1 + last + 1;
      else return first + skip;
    } else {
      if (last + 2 + skip < first) return -total - 1 + first;
      else return last + 2 + skip;
    }
  }

  indexOf(key = "") {
    const value = TVal(normalize(key), null, null);
    const total = this.size();

    for (let at = 0; at < total; at += 1) {
      const bias = this._cmp(value, this._vals[at]);

      if (bias > 0) continue;
      else if (bias === 0) return at;
      else return -total - 1 + at;
    }

    return -1;
  }

  lastIndexOf(key = "") {
    const value = TVal(normalize(key), null, null);
    const total = this.size();

    for (let at = total; at-- > 0; ) {
      const bias = this._cmp(value, this._vals[at]);

      if (bias < 0) continue;
      else if (bias === 0) return at;
      else return -total - 1 + at + 1;
    }

    return -total - 1;
  }

  valueOf(at = -2) {
    const total = this.size();
    const index = at < 0 ? total + 1 + at : at;

    if (index < 0) return undefined;
    else if (index < total) return this._vals[index].data;
    else return undefined;
  }

  get(key = "", skip = 0) {
    const at = this.offsetOf(key, skip);

    if (at < 0) return undefined;
    else return this.valueOf(at);
  }

  has(key = "", skip = 0) {
    const at = this.offsetOf(key, skip);

    if (at < 0) return false;
    else return true;
  }

  put(data = null, key = "", skip = -1) {
    const total = this.size();
    const value = TVal(normalize(key), data, null);
    const at = this.offsetOf(value.key, skip);

    if (at < 0) this._vals = write.call(this, value, at);
    else if (skip < 0) this._vals = write.call(this, value, -total - 1 + at);
    else this._vals = write.call(this, value, at);

    return this;
  }

  unset(key = "", skip = 0, ignore = null) {
    const at = this.offsetOf(normalize(key), skip);

    if (at > -1) this._vals = erase.call(this, ignore, at);

    return this;
  }

  remove(index = -2, ignore = null) {
    const total = this.size();
    const at = index < 0 ? total + 1 + index : index;

    if (at > -1 && at < total) erase.call(this, ignore, at);

    return this;
  }

  empty() {
    this._vals = [];

    return this;
  }

  set(key = "", data = null, ignore = null, skip = 0) {
    this.put(data, key, skip);

    return this;
  }

  delete(key = "", ignore = null, skip = 0) {
    const total = this.size();

    this.unset(key, skip);

    return total > this.size();
  }

  clear() {
    this.empty();

    return undefined;
  }

  push() {
    const ignore = null;
    const count = arguments.length;

    for (let index = 0; index < count; index += 1) {
      const value = TVal("", arguments[index], ignore);

      this._vals = write.call(this, value, -1);
    }

    return this.size();
  }

  pop() {
    const ignore = null;
    const value = this.valueOf(-2) || null;

    this._vals = erase.call(this, ignore, -2);

    return value ? value.data : undefined;
  }

  unshift() {
    const ignore = null;
    const count = arguments.length;
    let total = this.size();

    for (let index = 0; index < count; index += 1) {
      const value = TVal("", arguments[index], ignore);
      const at = -total - 1 - index;

      this._vals = write.call(this, value, at);
    }

    return this.size();
  }

  pop() {
    const ignore = null;
    const value = this.valueOf(0) || null;

    this._vals = erase.call(this, ignore, 0);

    return value ? value.data : undefined;
  }
}

export function* slowcheck(log = []) {
  function recorder(tape, performer) {
    Object.keys(performer).forEach(function(key) {
      if (typeof this[key] === "function") {
        const action = this[key];
        this[key] = function(...rest) {
          tape.push([key, ...rest]);
          return action.apply(this, rest);
        };
      }
    }, performer);
  }

  function noise() {
    return Math.random();
  }

  let ok = true;

  let fake = new TDummy();
  let real = new TTrunk();

  const jobs = {
    init() {
      fake = new TDummy();
      real = new TTrunk();
    },

    multiput(key = "", skip = -1, extra = 0) {
      let count = 1 + Math.max(0, 0 | extra);

      while (count-- > 0) {
        real.put(key + " : " + count, key, 0 | skip);
        fake.put(key + " : " + count, key, 0 | skip);
      }
    },

    checkAll(keys = []) {
      const count = keys.length;
      const total = real.size();

      if (total !== fake.size()) {
        term(new Error("Size mismatch"));
      }

      for (let index = 0; index < total; index += 1) {
        const data = real.valueOf(index);

        if (data !== fake.valueOf(index)) {
          term(new Error("Value mismatch"));
        }
      }

      for (let index = 0; index < count; index += 1) {
        const guess = keys[index];
        let at;

        at = real.indexOf(guess);

        if (at !== fake.indexOf(guess)) {
          term(new Error("Index mismatch"));
        }

        at = real.lastIndexOf(guess);

        if (at !== fake.lastIndexOf(guess)) {
          term(new Error("Reverse Index mismatch"));
        }

        for (let skip = -3 * total; skip < 3 * total; skip += 1) {
          at = real.offsetOf(guess, skip);

          if (at !== fake.offsetOf(guess, skip)) {
            term(new Error("Offset mismatch"));
          }
        }
      }
    }
  };

  try {
    if (!log.length) {
      recorder(log, jobs);

      jobs.init();

      let count = 20 + noise() * 50;

      while (count-- > 0) {
        jobs.multiput(
          noise().toString(),
          0 | ((count % 8) - 4),
          0 | (noise() * 5)
        );

        jobs.checkAll(
          new Array(0 | (noise() * 15))
            .fill(0)
            .map(noise)
            .map(String)
        );
      }
    } else {
      log.forEach(function([task, ...rest], step) {
        if (typeof this[task] !== "function") {
          debugger;
          throw new Error("Unrecognized task: " + task);
        } else {
          this[task].apply(this, rest);
        }
      }, jobs);
    }
  } catch (err) {
    ok = false;
    console.log(err);
    console.log(
      "if(slowcheck(" +
        JSON.stringify(log) +
        ").next().value) " +
        "throw new Error('slowcheck');"
    );
    debugger;
  }

  return ok ? null : log;
}

ENV.testsuite = testsuite;
ENV.slowcheck = slowcheck;

export function testsuite() {
  let code = 1;

  if (
    slowcheck([
      ["init"],
      ["multiput", "0.1650978879438718", 3, 4],
      ["checkAll", ["0.2563152228173142", "0.43517555519631745"]]
    ]).next().value
  )
    return -code;
  else code++;

  if (
    slowcheck([
      ["init"],
      ["multiput", "0.2404213606896899", -1, 4],
      [
        "checkAll",
        [
          "0.07167028614987836",
          "0.4727861171261172",
          "0.7754988209596645",
          "0.00431152543992086",
          "0.8325008668149192",
          "0.06027714042383647",
          "0.5703285762089434",
          "0.23366729042251522",
          "0.8120895485323796",
          "0.9608243830019643",
          "0.3806766569096032",
          "0.02942173852731722",
          "0.4357573005799005",
          "0.3412187038254204"
        ]
      ]
    ]).next().value
  )
    return -code;
  else code++;

  if (
    slowcheck([
      ["init"],
      ["multiput", "0.7527321681608505", -1, 4],
      [
        "checkAll",
        [
          "0.0951791145858174",
          "0.4873978976871194",
          "0.36560630441127273",
          "0.2992667154203872",
          "0.3607301908034677",
          "0.4213369291967277",
          "0.7581777338535123",
          "0.7462192893989936",
          "0.23977938472018478",
          "0.8851652897035507",
          "0.11493048354873303"
        ]
      ],
      ["multiput", "0.2995278606780125", -2, 0],
      [
        "checkAll",
        [
          "0.681355662828762",
          "0.30227509884672",
          "0.5330235189337766",
          "0.7523493059977346",
          "0.048769969632142196",
          "0.29629229601866447"
        ]
      ],
      ["multiput", "0.12134947113634631", -3, 0],
      [
        "checkAll",
        ["0.6092590725152383", "0.4670470827340498", "0.3145644015873479"]
      ],
      ["multiput", "0.6235787518782054", 3, 1],
      [
        "checkAll",
        [
          "0.9927833602332687",
          "0.40345607430025665",
          "0.3866768152530975",
          "0.3804200422015742",
          "0.11867590521860949",
          "0.5196364776580631",
          "0.40900480591768695",
          "0.12487104677745808",
          "0.7979791377843202",
          "0.01856401927417428",
          "0.2111124985741133"
        ]
      ],
      ["multiput", "0.3580675374131408", 2, 3],
      [
        "checkAll",
        ["0.8952605275287375", "0.9272711028119334", "0.38503463987884445"]
      ],
      ["multiput", "0.9938487664839455", 1, 0],
      [
        "checkAll",
        [
          "0.4464955613654531",
          "0.779730271081801",
          "0.29137326199582114",
          "0.34938010162661426"
        ]
      ],
      ["multiput", "0.4361097942881378", 0, 0],
      [
        "checkAll",
        [
          "0.973786448407653",
          "0.04840726463160583",
          "0.7339301026825891",
          "0.15357494317806597",
          "0.9148806950388779"
        ]
      ],
      ["multiput", "0.1059101194753791", 0, 1],
      [
        "checkAll",
        [
          "0.5808739720652676",
          "0.12219508216943309",
          "0.7051144745473603",
          "0.601547718509174",
          "0.27033524290069466",
          "0.2604824417133924",
          "0.672320506710262",
          "0.18908609114487285",
          "0.09044884680281107",
          "0.46514090107006956",
          "0.0849576348478247",
          "0.18118197341253062"
        ]
      ]
    ]).next().value
  )
    return -code;
  else code++;

  return 0;
}
