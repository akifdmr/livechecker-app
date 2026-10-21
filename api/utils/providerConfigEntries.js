// utils/providerConfigEntries.js
// PROVIDERS config'ini [key, cfg] çiftlerine açar.
// - Array olan (clover: [...], authorize: [...]) → her item ayrı key alır.
//   * item.key varsa onu kullanır.
//   * yoksa `${arrayKey}-${index+1}` üretir.
// - Object olan (stripe, moneris, mypos) → kendi key'i.
// - enabled=false olanlar filtrelenmez; çağıran taraf filtresini kendi uygular.
function providerConfigEntries(PROVIDERS = {}) {
  const entries = [];
  for (const [parentKey, val] of Object.entries(PROVIDERS || {})) {
    if (Array.isArray(val)) {
      val.forEach((item, i) => {
        if (!item || typeof item !== 'object') return;
        // item.key varsa onu kullan, yoksa `${parentKey}${index}` üret
        const key = item.key || `${parentKey}${i + 1}`;
        // cfg'ye key/type/name default'ları ekle
        entries.push([
          key,
          {
            key,
            type: item.type || parentKey,
            name: item.name || key,
            ...item,
          },
        ]);
      });
    } else if (val && typeof val === 'object') {
      entries.push([
        parentKey,
        {
          key: parentKey,
          type: val.type || parentKey,
          name: val.name || parentKey,
          ...val,
        },
      ]);
    }
  }
  return entries;
}

module.exports = { providerConfigEntries };