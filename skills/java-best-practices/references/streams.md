# Streams & Optionals

Modern Java patterns for streams.

## Table of Contents

- [Stream.ofNullable()](#streamofnullable)
- [Stream.iterate() with predicate](#streamiterate-with-predicate)
- [Stream takeWhile / dropWhile](#stream-takewhile--dropwhile)
- [Collectors.flatMapping()](#collectorsflatmapping)
- [Stream.toList()](#streamtolist)
- [Stream.mapMulti()](#streammapmulti)
- [Stream gatherers](#stream-gatherers)
- [Virtual thread executor](#virtual-thread-executor)
- [Optional.ifPresentOrElse()](#optionalifpresentorelse)
- [Optional.or() fallback](#optionalor-fallback)
- [Predicate.not() for negation](#predicatenot-for-negation)

---

## Stream.ofNullable()

**JDK Version:** 9

### Java 8

```java
Stream<String> s = val != null
    ? Stream.of(val)
    : Stream.empty();
```

### Java 9+

```java
Stream<String> s =
    Stream.ofNullable(val);
```

---

## Stream.iterate() with predicate

**JDK Version:** 9

### Java 8

```java
Stream.iterate(1, n -> n * 2)
    .limit(10)
    .forEach(System.out::println);
// can't stop at a condition
```

### Java 9+

```java
Stream.iterate(
    1,
    n -> n < 1000,
    n -> n * 2
).forEach(System.out::println);
// stops when n >= 1000
```

---

## Stream takeWhile / dropWhile

**JDK Version:** 9

### Java 8

```java
List<Integer> result = new ArrayList<>();
for (int n : sorted) {
    if (n >= 100) break;
    result.add(n);
}
// no stream equivalent in Java 8
```

### Java 9+

```java
var result = sorted.stream()
    .takeWhile(n -> n < 100)
    .toList();
// or: .dropWhile(n -> n < 10)
```

**Note:** `takeWhile`/`dropWhile` work best on ordered streams. On unordered streams, the behavior is nondeterministic.

---

## Collectors.flatMapping()

**JDK Version:** 9

### Java 8

```java
// Flatten within a grouping collector
// Required complex custom collector
Map<String, Set<String>> tagsByDept =
    // no clean way in Java 8
```

### Java 9+

```java
var tagsByDept = employees.stream()
    .collect(groupingBy(
        Emp::dept,
        flatMapping(
            e -> e.tags().stream(),
            toSet()
        )
    ));
```

---

## Stream.toList()

**JDK Version:** 16

### Java 8

```java
List<String> result = stream
    .filter(s -> s.length() > 3)
    .collect(Collectors.toList());
```

### Java 16+

```java
List<String> result = stream
    .filter(s -> s.length() > 3)
    .toList();
```

**Note:** Returns an unmodifiable list — unlike `Collectors.toList()` which returns a mutable `ArrayList`. If mutability is needed, use `collect(Collectors.toList())`.

---

## Stream.mapMulti()

**JDK Version:** 16

### Java 8

```java
stream.flatMap(order ->
    order.items().stream()
        .map(item -> new OrderItem(
            order.id(), item)
        )
);
```

### Java 16+

```java
stream.<OrderItem>mapMulti(
    (order, downstream) -> {
        for (var item : order.items())
            downstream.accept(
                new OrderItem(order.id(), item));
    }
);
```

---

## Stream gatherers

**JDK Version:** 24

### Java 8

```java
// Sliding window: manual implementation
List<List<T>> windows = new ArrayList<>();
for (int i = 0; i <= list.size()-3; i++) {
    windows.add(
        list.subList(i, i + 3));
}
```

### Java 24+

```java
var windows = stream
    .gather(
        Gatherers.windowSliding(3)
    )
    .toList();
```

---

## Virtual thread executor

**JDK Version:** 21

### Java 8

```java
ExecutorService exec =
    Executors.newFixedThreadPool(10);
try {
    futures = tasks.stream()
        .map(t -> exec.submit(t))
        .toList();
} finally {
    exec.shutdown();
}
```

### Java 21+

```java
try (var exec = Executors
        .newVirtualThreadPerTaskExecutor()) {
    var futures = tasks.stream()
        .map(exec::submit)
        .toList();
}
```

---

## Optional.ifPresentOrElse()

**JDK Version:** 9

### Java 8

```java
Optional<User> user = findUser(id);
if (user.isPresent()) {
    greet(user.get());
} else {
    handleMissing();
}
```

### Java 9+

```java
findUser(id).ifPresentOrElse(
    this::greet,
    this::handleMissing
);
```

---

## Optional.or() fallback

**JDK Version:** 9

### Java 8

```java
Optional<Config> cfg = primary();
if (!cfg.isPresent()) {
    cfg = secondary();
}
if (!cfg.isPresent()) {
    cfg = defaults();
}
```

### Java 9+

```java
Optional<Config> cfg = primary()
    .or(this::secondary)
    .or(this::defaults);
```

---

## Predicate.not() for negation

**JDK Version:** 11

### Java 8

```java
List<String> nonEmpty = list.stream()
    .filter(s -> !s.isBlank())
    .collect(Collectors.toList());
```

### Java 11+

```java
List<String> nonEmpty = list.stream()
    .filter(Predicate.not(String::isBlank))
    .toList();
```

---

