# Code Quality

Naming conventions, common bug patterns, code smells, and code review checklist.

## Table of Contents

- [Naming Conventions](#naming-conventions)
- [Common Bug Patterns](#common-bug-patterns)
- [Common Code Smells](#common-code-smells)
- [Code Review Checklist](#code-review-checklist)

---

## Naming Conventions

Follow Google's Java style guide:
- **Classes/Interfaces**: `UpperCamelCase` (e.g., `UserService`, `PaymentRepository`)
- **Methods/Variables**: `lowerCamelCase` (e.g., `getUserById`, `totalAmount`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRIES`, `DEFAULT_TIMEOUT`)
- **Packages**: `lowercase` (e.g., `com.example.service`)

Additional conventions:
- Use nouns for classes (`UserService`) and verbs for methods (`getUserById`)
- Avoid abbreviations and Hungarian notation
- Make names descriptive and self-documenting

---

## Common Bug Patterns

These map to static analysis rules (e.g., Sonar, SpotBugs, PMD) but can be applied manually:

- **Resource management**: Always close resources (files, sockets, streams). Use try-with-resources where possible so resources are closed automatically
- **Equality checks**: Compare object equality with `.equals()` or `Objects.equals(...)` rather than `==` for non-primitives; this avoids reference-equality bugs
- **Redundant casts**: Remove unnecessary casts; prefer correct generic typing and let the compiler infer types where possible
- **Reachable conditions**: Avoid conditional expressions that are always true or false; they indicate bugs or dead code and should be corrected

---

## Common Code Smells

These patterns indicate potential issues that should be addressed:

- **Parameter count**: Keep method parameter lists short. If a method needs many params, consider grouping into a value object or using the builder pattern
- **Method size**: Keep methods focused and small. Extract helper methods to improve readability and testability
- **Cognitive complexity**: Reduce nested conditionals and heavy branching by extracting methods, using polymorphism, or applying the Strategy pattern
- **Duplicated literals**: Extract repeated strings and numbers into named constants or enums to reduce errors and ease changes
- **Dead code**: Remove unused variables and assignments. They confuse readers and can hide bugs
- **Magic numbers**: Replace numeric literals with named constants that explain intent (e.g., `MAX_RETRIES`, `DEFAULT_PAGE_SIZE`)

---

## Code Review Checklist

### Modern Java Patterns

- [ ] Records used for DTOs and data-only classes (JDK 16+)
- [ ] Pattern matching used for instanceof and switch (JDK 16+)
- [ ] Text blocks used for multi-line strings (JDK 15+)
- [ ] Immutable collections with `List.of()`/`Map.of()` (JDK 9+)
- [ ] `Stream.toList()` instead of `collect(Collectors.toList())` where appropriate (JDK 16+)
- [ ] `var` used for local variables with clear types (JDK 10+)
- [ ] HTTP Client used instead of legacy HTTP APIs (JDK 11+)
- [ ] java.time API used instead of Date/Calendar (JDK 8+)
- [ ] Virtual threads considered for high-throughput I/O (JDK 21+)

### Best Practices

- [ ] Resources properly closed (try-with-resources)
- [ ] Object equality using `.equals()`, not `==`
- [ ] No magic numbers - extracted to named constants
- [ ] Methods focused and small (< 20 lines ideal)
- [ ] Exception handling follows unchecked exception strategy
- [ ] Validation at boundaries with `@Valid`
- [ ] Immutable objects and collections where appropriate
- [ ] No dead code or unused variables
- [ ] Appropriate JDK version features used for target version

### Exception Type Decision Tree

```
Is this a programming error (bug)?
├─ YES → IllegalArgumentException, IllegalStateException (unchecked)
└─ NO → Is this expected in normal business flow?
    ├─ YES → Use validation, Result<T>, or Optional<T>
    └─ NO → Custom unchecked exception (extends RuntimeException)
```

---

## Common Java Pitfalls — Do NOT Do This

Systematic coverage of frequent Java mistakes across all domains.

### Collections

```java
// ❌ BAD: Raw types — bypasses generics safety
List list = new ArrayList();
list.add("hello");
list.add(42); // compiles, crashes at runtime

// ✅ GOOD: Always use generics
List<String> list = new ArrayList<>();

// ❌ BAD: Mutable object as HashMap key
var map = new HashMap<List<String>, String>();
var key = new ArrayList<>(List.of("a"));
map.put(key, "value");
key.add("b"); // mutates key → hash changes → lookup fails
map.get(key); // returns null!

// ✅ GOOD: Use immutable keys
var map = new HashMap<List<String>, String>();
map.put(List.of("a"), "value"); // List.of() is immutable

// ❌ BAD: Returning mutable internal collection
public class Team {
    private final List<String> members = new ArrayList<>();
    public List<String> getMembers() { return members; } // caller can mutate!
}

// ✅ GOOD: Return unmodifiable view or copy
public List<String> getMembers() { return List.copyOf(members); }
```

### Streams

```java
// ❌ BAD: Reusing a stream after terminal operation
var stream = List.of(1, 2, 3).stream();
stream.forEach(System.out::println);
stream.count(); // throws IllegalStateException!

// ✅ GOOD: Create a new stream each time
var list = List.of(1, 2, 3);
list.stream().forEach(System.out::println);
var count = list.stream().count();

// ❌ BAD: Side effects inside stream pipeline
var results = new ArrayList<String>();
names.stream()
    .filter(n -> n.length() > 3)
    .forEach(results::add); // mutation in stream = hard-to-debug issues

// ✅ GOOD: Collect into result
var results = names.stream()
    .filter(n -> n.length() > 3)
    .toList();

// ❌ BAD: Using Optional.get() without check
Optional<User> user = repo.findById(id);
return user.get(); // throws NoSuchElementException if empty!

// ✅ GOOD: Use orElseThrow() with meaningful exception
return repo.findById(id)
    .orElseThrow(() -> new UserNotFoundException(id));
```

### Strings

```java
// ❌ BAD: String concatenation in a loop
String result = "";
for (var item : items) {
    result += item.getName() + ", "; // creates new String object each iteration
}

// ✅ GOOD: Use StringBuilder or String.join()
var result = items.stream()
    .map(Item::getName)
    .collect(Collectors.joining(", "));
```

### Object Comparison

```java
// ❌ BAD: == for object comparison
String a = new String("hello");
String b = new String("hello");
if (a == b) { /* false! compares references, not values */ }

// ✅ GOOD: .equals() for object comparison
if (a.equals(b)) { /* true */ }

// ✅ BETTER: Null-safe comparison
if (Objects.equals(a, b)) { /* handles null safely */ }
```

### Concurrency

```java
// ❌ BAD: synchronized on 'this' — any external code can lock on your instance
public synchronized void update() {
    // entire object is the lock monitor
}

// ✅ GOOD: Private lock object
private final Object lock = new Object();
public void update() {
    synchronized (lock) {
        // only this class can contend on this lock
    }
}

// ❌ BAD: synchronized with long I/O in virtual threads (causes pinning)
synchronized (lock) {
    var response = httpClient.send(request, bodyHandler);
}

// ✅ GOOD: ReentrantLock for virtual thread safety
private final ReentrantLock lock = new ReentrantLock();
lock.lock();
try {
    var response = httpClient.send(request, bodyHandler);
} finally {
    lock.unlock();
}
```

### Date/Time

```java
// ❌ BAD: LocalDateTime for timestamps — loses timezone info
LocalDateTime now = LocalDateTime.now();
// Stores "2024-03-14T10:30:00" but WHICH timezone?

// ✅ GOOD: Instant for timestamps (UTC)
Instant now = Instant.now(); // always UTC

// ✅ GOOD: ZonedDateTime when timezone matters
ZonedDateTime meeting = ZonedDateTime.of(2024, 3, 14, 10, 30, 0, 0, ZoneId.of("America/New_York"));

// ✅ GOOD: LocalDate for dates without time (birthdays, holidays)
LocalDate birthday = LocalDate.of(1990, 5, 15);
```

### Exceptions

```java
// ❌ BAD: Empty catch block — silently swallows errors
try {
    riskyOperation();
} catch (Exception e) {
    // nothing here — bug goes unnoticed
}

// ❌ BAD: Catch generic Exception
try {
    processOrder();
} catch (Exception e) {
    logger.error("Error", e); // catches everything including NPE bugs
}

// ✅ GOOD: Catch specific exceptions
try {
    processOrder();
} catch (OrderValidationException e) {
    logger.warn("Invalid order: {}", e.getMessage());
} catch (PaymentFailedException e) {
    logger.error("Payment failed for order", e);
    throw e; // rethrow if can't handle
}

// ❌ BAD: Lost exception chain
try {
    parseJson(input);
} catch (JsonParseException e) {
    throw new AppException("Parse failed"); // original cause lost!
}

// ✅ GOOD: Preserve exception chain
try {
    parseJson(input);
} catch (JsonParseException e) {
    throw new AppException("Parse failed", e); // keeps original stack trace
}
```
