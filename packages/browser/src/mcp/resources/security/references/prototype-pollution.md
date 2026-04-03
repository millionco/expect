# Prototype Pollution

Modifying `Object.prototype` to inject properties into all objects, leading to logic bugs, XSS, or denial of service.

## How It Works

JavaScript objects inherit from `Object.prototype`. If an attacker can set properties on `Object.prototype`, those properties appear on every object in the application.

```javascript
// Normal object
const obj = {};
console.log(obj.isAdmin); // undefined

// After prototype pollution
Object.prototype.isAdmin = true;
console.log(obj.isAdmin); // true (inherited from prototype)
```

## Vulnerable Patterns

### Recursive Object Merge

```javascript
// VULNERABLE: deep merge without __proto__ filtering
const merge = (target, source) => {
  for (const key in source) {
    if (typeof source[key] === "object" && source[key] !== null) {
      if (!target[key]) target[key] = {};
      merge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
};

// Attacker sends: { "__proto__": { "isAdmin": true } }
merge({}, JSON.parse(userInput));
// Now every object has isAdmin === true
```

### Query String Parsing

```javascript
// VULNERABLE: qs library with default settings (older versions)
const params = qs.parse("__proto__[isAdmin]=true");
// Pollutes Object.prototype.isAdmin

// VULNERABLE: custom query parser
const parseQuery = (query) => {
  const result = {};
  for (const [key, value] of new URLSearchParams(query)) {
    setNestedValue(result, key.split("."), value);
  }
  return result;
};
// Input: ?__proto__.isAdmin=true
```

### Object.assign with User Keys

```javascript
// VULNERABLE: user-controlled keys in object construction
const settings = {};
for (const [key, value] of Object.entries(userInput)) {
  settings[key] = value;
}
// If userInput has __proto__ as a key, this pollutes the prototype
```

### Lodash/Underscore Deep Operations

```javascript
// VULNERABLE: older lodash versions
_.merge({}, userControlledObject);
_.set({}, userControlledPath, value);
_.defaultsDeep({}, userControlledObject);
// These were patched in lodash >= 4.17.12
```

## Safe Patterns

### Filter Dangerous Keys

```javascript
// SAFE: block prototype-polluting keys
const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const safeMerge = (target, source) => {
  for (const key of Object.keys(source)) {
    if (BLOCKED_KEYS.has(key)) continue;
    if (typeof source[key] === "object" && source[key] !== null) {
      if (!target[key]) target[key] = {};
      safeMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
};
```

### Use Object.create(null)

```javascript
// SAFE: objects with no prototype cannot be polluted
const config = Object.create(null);
config.theme = "dark";
// config has no __proto__, constructor, or prototype chain
```

### Use Map Instead of Plain Objects

```javascript
// SAFE: Map does not use prototype chain for storage
const settings = new Map();
settings.set(userKey, userValue);
// No prototype pollution possible
```

### Freeze the Prototype

```javascript
// SAFE: prevent any modifications to Object.prototype
Object.freeze(Object.prototype);
// Note: this may break some libraries
```

## Impact Scenarios

| Polluted Property | Impact                                        |
| ----------------- | --------------------------------------------- |
| `isAdmin`         | Authorization bypass                          |
| `role`            | Privilege escalation                          |
| `innerHTML`       | XSS if used in template rendering             |
| `constructor`     | Code execution in some frameworks             |
| `toString`        | Denial of service (crashes string operations) |
| `hasOwnProperty`  | Logic bugs in property checks                 |

## Verification Checklist

1. Does any code recursively merge user-controlled objects into application objects?
2. Are `__proto__`, `constructor`, and `prototype` keys filtered from user input?
3. Is `qs.parse` used without `{ allowPrototypes: false }` (default in newer versions)?
4. Are lodash `merge`, `set`, or `defaultsDeep` used with user-controlled objects?
5. Is `Object.create(null)` or `Map` used for objects keyed by user input?
