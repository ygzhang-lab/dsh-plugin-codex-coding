# Error Handling

Modern Java patterns for errors.

## Table of Contents

- [Helpful NullPointerExceptions](#helpful-nullpointerexceptions)
- [Optional chaining](#optional-chaining)
- [Objects.requireNonNullElse()](#objectsrequirenonnullorelse)
- [Multi-catch exception handling](#multi-catch-exception-handling)
- [Null case in switch](#null-case-in-switch)
- [Record-based error responses](#record-based-error-responses)
- [Optional.orElseThrow() without supplier](#optionalorelethrow-without-supplier)

---

## Helpful NullPointerExceptions

**JDK Version:** 14

### Java 8

```java
// Old NPE message:
// "NullPointerException"
// at MyApp.main(MyApp.java:42)
// Which variable was null?!
```

### Java 14+

```java
// Modern NPE message:
// Cannot invoke "String.length()"
// because "user.address().city()"
// is null
// Exact variable identified!
```

**Note:** Enabled by default since JDK 14 — no code changes needed, just upgrade the JDK.

---

## Optional chaining

**JDK Version:** 9

### Java 8

```java
String city = null;
if (user != null) {
    Address addr = user.getAddress();
    if (addr != null) {
        city = addr.getCity();
    }
}
if (city == null) city = "Unknown";
```

### Java 9+

```java
String city = Optional.ofNullable(user)
    .map(User::address)
    .map(Address::city)
    .orElse("Unknown");
```

---

## Objects.requireNonNullElse()

**JDK Version:** 9

### Java 8

```java
String name = input != null
    ? input
    : "default";
// easy to get the order wrong
```

### Java 9+

```java
String name = Objects
    .requireNonNullElse(
        input, "default"
    );
```

---

## Multi-catch exception handling

**JDK Version:** 7

### Pre-Java 7

```java
try {
    process();
} catch (IOException e) {
    log(e);
} catch (SQLException e) {
    log(e);
} catch (ParseException e) {
    log(e);
}
```

### Java 7+

```java
try {
    process();
} catch (IOException
    | SQLException
    | ParseException e) {
    log(e);
}
```

---

## Null case in switch

**JDK Version:** 21

### Java 8

```java
// Must check before switch
if (status == null) {
    return "unknown";
}
return switch (status) {
    case ACTIVE  -> "active";
    case PAUSED  -> "paused";
    default      -> "other";
};
```

### Java 21+

```java
return switch (status) {
    case null    -> "unknown";
    case ACTIVE  -> "active";
    case PAUSED  -> "paused";
    default      -> "other";
};
```

---

## Record-based error responses

**JDK Version:** 16

### Java 8

```java
// Verbose error class
public class ErrorResponse {
    private final int code;
    private final String message;
    // constructor, getters, equals,
    // hashCode, toString...
}
```

### Java 16+

```java
public record ApiError(
    int code,
    String message,
    Instant timestamp
) {
    public ApiError(int code, String msg) {
        this(code, msg, Instant.now());
    }
}
```

---

## Optional.orElseThrow() without supplier

**JDK Version:** 10

### Java 8

```java
// Risky: get() throws if empty, no clear intent
String value = optional.get();

// Verbose: supplier just for NoSuchElementException
String value = optional
    .orElseThrow(NoSuchElementException::new);
```

### Java 10+

```java
// Clear intent: throws NoSuchElementException if empty
String value = optional.orElseThrow();
```

**Note:** `orElseThrow()` throws `NoSuchElementException` if empty. Prefer over `get()` which is widely considered a code smell.

---

