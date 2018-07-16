import jftree from "./jftree.js";

export default Promise.all([
  import("flatbuffers")
    .then(flatbuffers =>
      jftree().POLYFILL({
        fbs: flatbuffers
      })
    )
    .catch(() => {
      throw new Error("Failed to load flatbuffers for jftree");
    })
]);
