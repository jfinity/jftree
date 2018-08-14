import jftree from "../jftree.js";

const ENV = (that => this || that)(
  "undefined" !== typeof window ? window || {} : {}
);

const { TTrunk, TVal, normalize } = jftree();

function term(err) {
  debugger;
  throw err;
}

const stableSort = (function iife() {
  function tuplet(list, item, at) {
    list[at] = { item, at };
    return list;
  }

  function untuple(list, pair, at) {
    list[at] = pair.item;
    return list;
  }

  function stable(alpha, beta) {
    return this(alpha.item, beta.item) || alpha.at - beta.at;
  }

  function zero() {
    return 0;
  }

  return function sort(cmp) {
    return this.reduce(tuplet, this)
      .sort(stable.bind(cmp || zero))
      .reduce(untuple, this);
  };
})();

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

  if (!shallowArrayEqual(vals, stableSort.call(vals.slice(), this._cmp))) {
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

export function slowcheck(log = []) {
  return new Promise(emit => {
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
      console.log(err);
      console.log(
        `
try {
  switch (0) {

    case 0:
      throw slowcheck(
        ${JSON.stringify(log)}
      );

    default:
      break;
  }
} catch (caught) {
  caught.then(log => log);
}`
      );
      debugger;
      emit(log);
    }

    return emit(null);
  });
}

ENV.testsuite = testsuite;
ENV.slowcheck = slowcheck;

export function testsuite(code = 0) {
  let id = code || 7;

  if (!code) {
    return Promise.resolve(null).then(function run(log) {
      if (log) return id + 1;
      else if (id > 0) return testsuite(id--).then(run);
      else return 0;
    });
  }

  try {
    switch (code) {
      case 7:
        throw slowcheck([
          ["init"],
          ["multiput", "0.5745226304616442", 0, 4],
          [
            "checkAll",
            [
              "0.18071827188344658",
              "0.1388053697484546",
              "0.950528383382095",
              "0.36690980964127085",
              "0.3680669102230858",
              "0.09331967387605222",
              "0.7270330195284689",
              "0.3775256566130256",
              "0.11103422085385195",
              "0.8717316575911005",
              "0.009866328437535321",
              "0.7546778163132928",
              "0.5698136892274452",
              "0.2843249346648995"
            ]
          ],
          ["multiput", "0.958957817204569", 0, 4],
          [
            "checkAll",
            [
              "0.7287929111685834",
              "0.9023592653080736",
              "0.3607509977289103",
              "0.8374053710946532",
              "0.0713758605690551",
              "0.6395360665764451",
              "0.5835430654980933",
              "0.9058176324677403",
              "0.5755788383925813",
              "0.0935117939130603"
            ]
          ],
          ["multiput", "0.4088089786170668", -1, 2],
          ["checkAll", ["0.44602998534795435"]],
          ["multiput", "0.5181580413068205", -2, 3],
          [
            "checkAll",
            [
              "0.7641759937476753",
              "0.5112684538823866",
              "0.879379853028611",
              "0.5322245443490803",
              "0.8469080676574703",
              "0.7946644393767199",
              "0.0846902042230171",
              "0.16591908197889738",
              "0.04882549239066436"
            ]
          ],
          ["multiput", "0.5523456861413232", -3, 2],
          [
            "checkAll",
            ["0.11067225139041947", "0.6210793575019318", "0.8223889972308556"]
          ],
          ["multiput", "0.4025360700488505", 3, 3],
          [
            "checkAll",
            [
              "0.78752554278652",
              "0.4031081879209495",
              "0.5110075954363935",
              "0.4441065310061798",
              "0.15922006847003112",
              "0.4658307714902328",
              "0.24531980839645873",
              "0.8272765404095235",
              "0.3320512475176267",
              "0.48756325495641417"
            ]
          ],
          ["multiput", "0.49333139325547526", 2, 2],
          [
            "checkAll",
            [
              "0.7657302351001234",
              "0.8536926381563206",
              "0.21087242472678058",
              "0.6077612919661246",
              "0.6912557386260108",
              "0.741110916654725",
              "0.6955644936280796",
              "0.2532891415242431",
              "0.5753072470134444",
              "0.6855607879937349",
              "0.518099125755793",
              "0.4911420742327761",
              "0.8423481186848005"
            ]
          ],
          ["multiput", "0.9399442494262655", 1, 3],
          [
            "checkAll",
            [
              "0.9490559929623243",
              "0.0871226768807789",
              "0.13006198326087715",
              "0.9554855703283274",
              "0.026645417051393894",
              "0.44562383087639157",
              "0.09105362945948436",
              "0.7993596982996474",
              "0.48132303291485523",
              "0.544308679280797",
              "0.6424316725329768",
              "0.055603629131939725"
            ]
          ],
          ["multiput", "0.6602448531938032", 0, 3],
          [
            "checkAll",
            [
              "0.9817378652431263",
              "0.0846119308732689",
              "0.12781701190659356",
              "0.8626956547764488",
              "0.5901301083662123",
              "0.12720207976811415",
              "0.14199711174765084",
              "0.16444299953562846"
            ]
          ]
        ]);
      case 6:
        throw slowcheck([
          ["init"],
          ["multiput", "0.7844545090044648", -3, 2],
          [
            "checkAll",
            [
              "0.7432719830732559",
              "0.5220288279610785",
              "0.6157178989278644",
              "0.15889930146082043",
              "0.7298909058249625",
              "0.9883577880481142",
              "0.4760533319686644"
            ]
          ],
          ["multiput", "0.43843531076987285", 3, 0],
          [
            "checkAll",
            [
              "0.574884340682744",
              "0.4685502920952882",
              "0.6189048532874533",
              "0.6586493831974383",
              "0.23611500577981093"
            ]
          ],
          ["multiput", "0.3029796832860132", 2, 3],
          [
            "checkAll",
            [
              "0.40007359820867605",
              "0.9978415910025991",
              "0.31733361255628845",
              "0.11690446268598254",
              "0.5621983133606634",
              "0.6898504368514411"
            ]
          ],
          ["multiput", "0.15943240759526156", 1, 1],
          [
            "checkAll",
            [
              "0.768723368410682",
              "0.650349756080616",
              "0.5546977034458047",
              "0.18249615974060251",
              "0.9819005118412965",
              "0.9364076707955962",
              "0.6645639149861868",
              "0.771960856698708",
              "0.541048591327028",
              "0.9794922823420642",
              "0.7158132487459088",
              "0.5427872010513908",
              "0.4346193768394726",
              "0.13276634000424226"
            ]
          ],
          ["multiput", "0.8440049711138646", 0, 1],
          ["checkAll", []],
          ["multiput", "0.5103757691988662", 0, 3],
          ["checkAll", ["0.06161863818464797", "0.8427381463667065"]],
          ["multiput", "0.90957148516059", -1, 4],
          [
            "checkAll",
            [
              "0.44617455302631415",
              "0.461561276809481",
              "0.27868386784843",
              "0.8896489223290203",
              "0.3445283402095298",
              "0.5473507747081698",
              "0.47004494687843357",
              "0.27428875364348015",
              "0.3907516703765641"
            ]
          ],
          ["multiput", "0.2140101012160136", -2, 4],
          [
            "checkAll",
            [
              "0.9044309049625745",
              "0.7211232726968242",
              "0.8857455152160536",
              "0.531015320438391",
              "0.1553930650702835",
              "0.27007086954517323",
              "0.14598775279276643",
              "0.5427762469155135",
              "0.6553841564958682"
            ]
          ],
          ["multiput", "0.7036862035394102", -3, 3],
          [
            "checkAll",
            [
              "0.7256861019405372",
              "0.37287866526039903",
              "0.25314982695710175",
              "0.12838831613644497",
              "0.5950768921365897",
              "0.2328976070125548",
              "0.16092734209124426"
            ]
          ]
        ]);

      case 5:
        throw slowcheck([
          ["init"],
          ["multiput", "0.18078933255431395", -2, 2],
          ["checkAll", []],
          ["multiput", "0.5807032499069067", -3, 1],
          [
            "checkAll",
            [
              "0.4839656394300913",
              "0.11195188975610182",
              "0.7386854437973149",
              "0.20469157627522927",
              "0.008502665832781808",
              "0.6818210037041956",
              "0.3446119792507927",
              "0.6776485450180605",
              "0.13225361331011243",
              "0.7044090915468233",
              "0.5699702494084429",
              "0.4046221337602185",
              "0.4440184365010844"
            ]
          ],
          ["multiput", "0.9785496232080138", 3, 1],
          [
            "checkAll",
            [
              "0.299304448884792",
              "0.6993987378940743",
              "0.2883922916372299",
              "0.465747433233588",
              "0.08672024113199561",
              "0.6612476090174626",
              "0.07852024046381034",
              "0.08856146400282072",
              "0.051785352117367456",
              "0.20363935975087277",
              "0.920961470678018"
            ]
          ],
          ["multiput", "0.6208714391824233", 2, 1],
          [
            "checkAll",
            [
              "0.8277855650590129",
              "0.7962922579454645",
              "0.56738243936533",
              "0.01564988845571702",
              "0.20876685034047893",
              "0.6510172461716677",
              "0.4105654908885814",
              "0.18968992393726958",
              "0.3255616774316179",
              "0.08934115607381798"
            ]
          ],
          ["multiput", "0.2106456130241714", 1, 1],
          ["checkAll", ["0.7356010592111986", "0.7889879009084808"]],
          ["multiput", "0.33024218368725133", 0, 1],
          [
            "checkAll",
            [
              "0.07120341489702686",
              "0.6846741917541854",
              "0.710902663443471",
              "0.6629040690213805",
              "0.1464344063924523",
              "0.02031188967347486",
              "0.8893536348545068",
              "0.9736735353611656",
              "0.9954456114708077",
              "0.5736645958061053",
              "0.49512779386113115",
              "0.7405447007988586"
            ]
          ],
          ["multiput", "0.2997709433583833", 0, 2],
          [
            "checkAll",
            [
              "0.08846044036412759",
              "0.7213438374708421",
              "0.10109656692101088",
              "0.23927043286889504",
              "0.4456066750646521",
              "0.7287508962675373"
            ]
          ],
          ["multiput", "0.73879523064034", -1, 4],
          ["checkAll", ["0.08642731813955318"]]
        ]);

      case 4:
        throw slowcheck([
          ["init"],
          ["multiput", "0.8714311689565652", 3, 2],
          [
            "checkAll",
            [
              "0.9527543161436851",
              "0.3324919783066944",
              "0.13549884977416315",
              "0.3112732764627948",
              "0.30935610906579747",
              "0.4526298583491719",
              "0.23490938978403442",
              "0.42349021119099906",
              "0.3936082477750209",
              "0.8241795163334298",
              "0.8879930281369004",
              "0.3476456934476282",
              "0.563355708024524",
              "0.16995256450421747"
            ]
          ],
          ["multiput", "0.4953621672722708", 2, 3],
          ["checkAll", ["0.7986733270327431", "0.4627308711661877"]],
          ["multiput", "0.3953543003896087", 1, 1],
          [
            "checkAll",
            [
              "0.03242671726812518",
              "0.011241486469775852",
              "0.09312902189279937",
              "0.7208241385621186",
              "0.5428354244445708",
              "0.004315220531380337",
              "0.09168748180835062"
            ]
          ],
          ["multiput", "0.8643243047828435", 0, 1],
          [
            "checkAll",
            [
              "0.7071188420876817",
              "0.7777067687729204",
              "0.31302300213719203",
              "0.5098500279183551",
              "0.4891265988659119",
              "0.5009660089623846",
              "0.7972237097374428",
              "0.47254755517622593",
              "0.551443233947112"
            ]
          ],
          ["multiput", "0.7585799917652716", 0, 0],
          [
            "checkAll",
            [
              "0.6700917591057138",
              "0.4724050265612081",
              "0.8425182076682478",
              "0.9048397173212614",
              "0.08348524928488055",
              "0.28992999731151503",
              "0.7758185670990427",
              "0.02266711047433434",
              "0.730768137542839",
              "0.47708018363100657",
              "0.5966602689605511"
            ]
          ],
          ["multiput", "0.7972737898297635", -1, 0],
          [
            "checkAll",
            [
              "0.17116922028672965",
              "0.7510710638366991",
              "0.4130826774932814",
              "0.20939249877055",
              "0.5273919974003201"
            ]
          ],
          ["multiput", "0.7599651154095979", -2, 2],
          [
            "checkAll",
            [
              "0.7051449616315819",
              "0.6822799342300931",
              "0.7482443750452723",
              "0.6108399013857075",
              "0.34378653851030916",
              "0.19572501775900752",
              "0.9796522717125864",
              "0.18156989419827485",
              "0.415906274718606",
              "0.6620296602247542",
              "0.41445864907449703",
              "0.8427986181019971",
              "0.48254907880623876",
              "0.8546709789354388"
            ]
          ],
          ["multiput", "0.19393497545807103", -3, 3]
        ]);

      case 3:
        throw slowcheck([
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
        ]);

      case 2:
        throw slowcheck([
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
        ]);

      case 1:
        throw slowcheck([
          ["init"],
          ["multiput", "0.1650978879438718", 3, 4],
          ["checkAll", ["0.2563152228173142", "0.43517555519631745"]]
        ]);

      case -1:
        throw slowcheck();

      default:
        break;
    }
  } catch (thenable) {
    return thenable;
  }
}
