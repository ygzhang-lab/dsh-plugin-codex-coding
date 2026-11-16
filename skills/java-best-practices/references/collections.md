# Collections

Modern Java patterns for collections.

## Table of Contents

- [Immutable list creation](#immutable-list-creation)
- [Immutable map creation](#immutable-map-creation)
- [Immutable set creation](#immutable-set-creation)
- [Copying collections immutably](#copying-collections-immutably)
- [Map.entry() factory](#mapentry-factory)
- [Sequenced collections](#sequenced-collections)
- [Collectors.teeing()](#collectorsteeing)
- [Typed stream toArray](#typed-stream-toarray)
- [Unmodifiable collectors](#unmodifiable-collectors)

---

## Immutable list creation

**JDK Version:** 9

### Java 8

```java
List<String> list =
    Collections.unmodifiableList(
        new ArrayList<>(
            Arrays.asList("a", "b", "c")
        )
    );
```

### Java 9+

```java
List<String> list =
    List.of("a", "b", "c");
```

**Note:** `List.of()` rejects `null` elements (throws NPE). The returned list is structurally immutable — no `add`, `set`, or `remove`.

---

## Immutable map creation

**JDK Version:** 9

### Java 8

```java
Map<String, Integer> map = new HashMap<>();
map.put("a", 1);
map.put("b", 2);
map.put("c", 3);
map = Collections.unmodifiableMap(map);
```

### Java 9+

```java
Map<String, Integer> map =
    Map.of("a", 1, "b", 2, "c", 3);
```

**Note:** `Map.of()` supports up to 10 key-value pairs. For more entries, use `Map.ofEntries(Map.entry(k, v), ...)`.

---

## Immutable set creation

**JDK Version:** 9

### Java 8

```java
Set<String> set =
    Collections.unmodifiableSet(
        new HashSet<>(
            Arrays.asList("a", "b", "c")
        )
    );
```

### Java 9+

```java
Set<String> set =
    Set.of("a", "b", "c");
```

---

## Copying collections immutably

**JDK Version:** 10

### Java 8

```java
List<String> copy =
    Collections.unmodifiableList(
        new ArrayList<>(original)
    );
```

### Java 10+

```java
List<String> copy =
    List.copyOf(original);
```

---

## Map.entry() factory

**JDK Version:** 9

### Java 8

```java
Map.Entry<String, Integer> e =
    new AbstractMap.SimpleEntry<>(
        "key", 42
    );
```

### Java 9+

```java
var e = Map.entry("key", 42);
```

---

## Sequenced collections

**JDK Version:** 21

### Java 8

```java
// Get last element
var last = list.get(list.size() - 1);
// Get first
var first = list.get(0);
// Reverse iteration: manual
```

### Java 21+

```java
var last = list.getLast();
var first = list.getFirst();
var reversed = list.reversed();
```

---

## Collectors.teeing()

**JDK Version:** 12

### Java 8

```java
long count = items.stream().count();
double sum = items.stream()
    .mapToDouble(Item::price)
    .sum();
var result = new Stats(count, sum);
```

### Java 12+

```java
var result = items.stream().collect(
    Collectors.teeing(
        Collectors.counting(),
        Collectors.summingDouble(Item::price),
        Stats::new
    )
);
```

---

## Typed stream toArray

**JDK Version:** 8

### Pre-Streams

```java
List<String> list = getNames();
String[] arr = new String[list.size()];
for (int i = 0; i < list.size(); i++) {
    arr[i] = list.get(i);
}
```

### Java 8+

```java
String[] arr = getNames().stream()
    .filter(n -> n.length() > 3)
    .toArray(String[]::new);
```

---

## Unmodifiable collectors

**JDK Version:** 10

### Java 8

```java
List<String> list = stream.collect(
    Collectors.collectingAndThen(
        Collectors.toList(),
        Collections::unmodifiableList
    )
);
```

### Java 10+

```java
List<String> list = stream.collect(
    Collectors.toUnmodifiableList()
);
```

---

