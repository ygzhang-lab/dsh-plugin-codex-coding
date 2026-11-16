# Date/Time & Utilities

Modern Java patterns for datetime.

## Table of Contents

- [java.time API basics](#javatime-api-basics)
- [Duration and Period](#duration-and-period)
- [Date formatting](#date-formatting)
- [Instant with nanosecond precision](#instant-with-nanosecond-precision)
- [Math.clamp()](#mathclamp)
- [HexFormat](#hexformat)

---

## java.time API basics

**JDK Version:** 8

### Pre-Java 8

```java
// Mutable, confusing, zero-indexed months
Calendar cal = Calendar.getInstance();
cal.set(2025, 0, 15); // January = 0!
Date date = cal.getTime();
// not thread-safe
```

### Java 8+

```java
LocalDate date = LocalDate.of(
    2025, Month.JANUARY, 15);
LocalTime time = LocalTime.of(14, 30);
Instant now = Instant.now();
// immutable, thread-safe
```

**Note:** `java.time` months are 1-indexed (`JANUARY = 1`), unlike `Calendar` where `JANUARY = 0`. All types are immutable and thread-safe.

---

## Duration and Period

**JDK Version:** 8

### Pre-Java 8

```java
// How many days between two dates?
long diff = date2.getTime()
    - date1.getTime();
long days = diff
    / (1000 * 60 * 60 * 24);
// ignores DST, leap seconds
```

### Java 8+

```java
long days = ChronoUnit.DAYS
    .between(date1, date2);
Period period = Period.between(
    date1, date2);
Duration elapsed = Duration.between(
    time1, time2);
```

---

## Date formatting

**JDK Version:** 8

### Pre-Java 8

```java
// Not thread-safe!
SimpleDateFormat sdf =
    new SimpleDateFormat("yyyy-MM-dd");
String formatted = sdf.format(date);
// Must synchronize for concurrent use
```

### Java 8+

```java
DateTimeFormatter fmt =
    DateTimeFormatter.ofPattern(
        "uuuu-MM-dd");
String formatted =
    LocalDate.now().format(fmt);
// Thread-safe, immutable
```

**Note:** `DateTimeFormatter` is thread-safe — store as `static final`. Use predefined formatters like `ISO_LOCAL_DATE` for standard formats.

---

## Instant with nanosecond precision

**JDK Version:** 9

### Java 8

```java
// Millisecond precision only
long millis =
    System.currentTimeMillis();
// 1708012345678
```

### Java 9+

```java
// Microsecond/nanosecond precision
Instant now = Instant.now();
// 2025-02-15T20:12:25.678901234Z
long nanos = now.getNano();
```

---

## Math.clamp()

**JDK Version:** 21

### Java 8

```java
// Clamp value between min and max
int clamped =
    Math.min(Math.max(value, 0), 100);
// or: min and max order confusion
```

### Java 21+

```java
int clamped =
    Math.clamp(value, 0, 100);
// value constrained to [0, 100]
```

---

## HexFormat

**JDK Version:** 17

### Java 8

```java
// Pad to 2 digits, uppercase
String hex = String.format(
    "%02X", byteValue);
// Parse hex string
int val = Integer.parseInt(
    "FF", 16);
```

### Java 17+

```java
HexFormat hex = HexFormat.of()
    .withUpperCase();
String s = hex.toHexDigits(
    byteValue);
byte[] bytes =
    hex.parseHex("48656C6C6F");
```

---

