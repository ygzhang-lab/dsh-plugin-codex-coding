# Security

Modern Java patterns for security.

## Table of Contents

- [PEM encoding/decoding](#pem-encodingdecoding)
- [Key Derivation Functions](#key-derivation-functions)
- [Strong random generation](#strong-random-generation)
- [TLS 1.3 by default](#tls-13-by-default)
- [RandomGenerator interface](#randomgenerator-interface)

---

## PEM encoding/decoding

**JDK Version:** 25

### Java 8

```java
String pem = "-----BEGIN CERTIFICATE-----\n"
    + Base64.getMimeEncoder()
        .encodeToString(
            cert.getEncoded())
    + "\n-----END CERTIFICATE-----";
```

### Java 25 (Preview)

```java
// Encode to PEM
String pem = PEMEncoder.of()
    .encodeToString(cert);
// Decode from PEM
var cert = PEMDecoder.of()
    .decode(pemString);
```

---

## Key Derivation Functions

**JDK Version:** 25

### Java 8

```java
SecretKeyFactory factory =
    SecretKeyFactory.getInstance(
        "PBKDF2WithHmacSHA256");
KeySpec spec = new PBEKeySpec(
    password, salt, 10000, 256);
SecretKey key =
    factory.generateSecret(spec);
```

### Java 25

```java
KDF kdf = KDF.getInstance("HKDF-SHA256");
SecretKey key = kdf.deriveKey(
    "AES",
    KDF.HKDFParameterSpec
        .ofExtract()
        .addIKM(inputKey)
        .addSalt(salt)
        .thenExpand(info, 32)
        .build()
);
```

---

## Strong random generation

**JDK Version:** 9

### Java 8

```java
// Default algorithm — may not be
// the strongest available
SecureRandom random =
    new SecureRandom();
byte[] bytes = new byte[32];
random.nextBytes(bytes);
```

### Java 9+

```java
// Platform's strongest algorithm
SecureRandom random =
    SecureRandom.getInstanceStrong();
byte[] bytes = new byte[32];
random.nextBytes(bytes);
```

**Note:** `getInstanceStrong()` may block on Linux if entropy is low. Use default `new SecureRandom()` for non-blocking when strong guarantees aren't required.

---

## TLS 1.3 by default

**JDK Version:** 11

### Java 8

```java
SSLContext ctx =
    SSLContext.getInstance("TLSv1.2");
ctx.init(null, trustManagers, null);
SSLSocketFactory factory =
    ctx.getSocketFactory();
// Must specify protocol version
```

### Java 11+

```java
// TLS 1.3 is the default!
var client = HttpClient.newBuilder()
    .sslContext(SSLContext.getDefault())
    .build();
// Already using TLS 1.3
```

---

## RandomGenerator interface

**JDK Version:** 17

### Java 8

```java
// Hard-coded to one algorithm
Random rng = new Random();
int value = rng.nextInt(100);

// Or thread-local, but still locked in
int value = ThreadLocalRandom.current()
    .nextInt(100);
```

### Java 17+

```java
// Algorithm-agnostic via factory
var rng = RandomGenerator.of("L64X128MixRandom");
int value = rng.nextInt(100);

// Or get a splittable generator
var rng = RandomGeneratorFactory
    .of("L64X128MixRandom").create();
```

---

