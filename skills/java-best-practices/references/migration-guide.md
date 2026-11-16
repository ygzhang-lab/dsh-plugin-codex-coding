# Migration Guide

Structured upgrade playbooks for migrating between Java LTS versions, with API replacement tables, build tool updates, and step-by-step modernization checklists.

## Table of Contents

- [Java 8 → 11](#java-8--11)
- [Java 11 → 17](#java-11--17)
- [Java 17 → 21](#java-17--21)
- [Java 21 → 25](#java-21--25)
- [Legacy API Replacement Table](#legacy-api-replacement-table)
- [Build Tool Modernization](#build-tool-modernization)
- [Module System (JPMS) Migration](#module-system-jpms-migration)
- [Deprecation and Removal Tracker](#deprecation-and-removal-tracker)

---

## Java 8 → 11

### Pre-Migration Checklist

- [ ] Inventory all dependencies and check JDK 11 compatibility
- [ ] Identify usage of removed modules (JavaEE, CORBA, JavaFX)
- [ ] Check for internal API usage (`sun.*`, `com.sun.*`)
- [ ] Run `jdeps --jdk-internals` to find illegal access
- [ ] Update build tools (Maven 3.5+, Gradle 5+)

### Key Changes

```java
// 1. Removed JavaEE modules — add explicit dependencies
// ❌ No longer available out of the box in JDK 11
import javax.xml.bind.JAXBContext;

// ✅ Add Maven dependency:
// <dependency>
//     <groupId>jakarta.xml.bind</groupId>
//     <artifactId>jakarta.xml.bind-api</artifactId>
//     <version>4.0.0</version>
// </dependency>

// 2. New String methods
var blank = "  ".isBlank();           // true
var stripped = "  hello  ".strip();    // "hello" (Unicode-aware)
var lines = "a\nb\nc".lines().toList(); // ["a", "b", "c"]
var repeated = "ab".repeat(3);         // "ababab"

// 3. Files convenience methods
var content = Files.readString(Path.of("file.txt"));
Files.writeString(Path.of("out.txt"), "hello");

// 4. HTTP Client (replaces HttpURLConnection)
var client = HttpClient.newHttpClient();
var request = HttpRequest.newBuilder()
    .uri(URI.create("https://api.example.com/users"))
    .GET()
    .build();
var response = client.send(request, HttpResponse.BodyHandlers.ofString());

// 5. var for local variables (JDK 10)
var users = List.of("Alice", "Bob"); // inferred as List<String>

// 6. Immutable collection factories (JDK 9)
var list = List.of(1, 2, 3);
var map = Map.of("key", "value");
var copy = List.copyOf(mutableList);
```

### Removed APIs

| Removed | Replacement |
|---------|-------------|
| `javax.xml.bind` (JAXB) | `jakarta.xml.bind:jakarta.xml.bind-api` |
| `javax.annotation` | `jakarta.annotation:jakarta.annotation-api` |
| `javax.activation` | `jakarta.activation:jakarta.activation-api` |
| `java.corba` | No replacement (protocol obsolete) |
| `java.transaction` | `jakarta.transaction:jakarta.transaction-api` |
| `java.xml.ws` (JAX-WS) | `jakarta.xml.ws:jakarta.xml.ws-api` |
| `JavaFX` | `org.openjfx` (separate module) |
| `Nashorn` JavaScript engine | GraalJS |

---

## Java 11 → 17

### Pre-Migration Checklist

- [ ] Upgrade to latest JDK 11 patch first
- [ ] Update Maven to 3.8+ and Gradle to 7+
- [ ] Check library compatibility with JDK 17 (Lombok, Mockito, ByteBuddy)
- [ ] Replace `javax.*` with `jakarta.*` if using Spring Boot 3+
- [ ] Run with `--illegal-access=deny` on JDK 11 to find reflection issues

### Key Changes

```java
// 1. Records — replace POJOs for data carriers (JDK 16)
// ❌ Old: verbose POJO
public class UserDTO {
    private final String name;
    private final String email;
    public UserDTO(String name, String email) { ... }
    public String getName() { return name; }
    public String getEmail() { return email; }
    @Override public boolean equals(Object o) { ... }
    @Override public int hashCode() { ... }
    @Override public String toString() { ... }
}

// ✅ Modern: Record
public record UserDTO(String name, String email) {}

// 2. Pattern matching for instanceof (JDK 16)
// ❌ Old
if (obj instanceof String) {
    String s = (String) obj;
    return s.toUpperCase();
}
// ✅ Modern
if (obj instanceof String s) {
    return s.toUpperCase();
}

// 3. Text blocks (JDK 15)
// ❌ Old
String json = "{\n" +
    "  \"name\": \"John\",\n" +
    "  \"status\": \"ACTIVE\"\n" +
    "}";
// ✅ Modern
String json = """
    {
      "name": "John",
      "status": "ACTIVE"
    }
    """;

// 4. Sealed classes (JDK 17)
public sealed interface Shape permits Circle, Rectangle, Triangle {}
public record Circle(double radius) implements Shape {}
public record Rectangle(double width, double height) implements Shape {}
public record Triangle(double base, double height) implements Shape {}

// 5. Switch expressions (JDK 14)
// ❌ Old
String label;
switch (status) {
    case ACTIVE: label = "Active"; break;
    case INACTIVE: label = "Inactive"; break;
    default: label = "Unknown";
}
// ✅ Modern
var label = switch (status) {
    case ACTIVE -> "Active";
    case INACTIVE -> "Inactive";
    default -> "Unknown";
};

// 6. Helpful NullPointerExceptions (JDK 14)
// Now reports: "Cannot invoke String.length() because user.getAddress().getCity() is null"

// 7. Stream.toList() (JDK 16)
// ❌ Old
var names = users.stream().map(User::getName).collect(Collectors.toList());
// ✅ Modern
var names = users.stream().map(User::getName).toList();
```

### Strong Encapsulation (Critical)

```
# JDK 17 enforces strong encapsulation of internal APIs.
# If your code or libraries use reflection on JDK internals:
--add-opens java.base/java.lang=ALL-UNNAMED
--add-opens java.base/java.util=ALL-UNNAMED

# Better: fix the library or find an alternative
```

---

## Java 17 → 21

### Pre-Migration Checklist

- [ ] Update build tools (Maven 3.9+, Gradle 8+)
- [ ] Update test libraries (Mockito 5+, JUnit 5.10+)
- [ ] Review thread pool usage — candidates for virtual threads
- [ ] Check for ThreadLocal usage (may need ScopedValue migration)
- [ ] Test with Spring Boot 3.2+ for virtual thread support

### Key Changes

```java
// 1. Virtual threads (JDK 21) — massive concurrency improvement
// ❌ Old: platform thread pool (limited scalability)
var executor = Executors.newFixedThreadPool(200);

// ✅ Modern: virtual threads (millions of concurrent tasks)
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    for (var task : tasks) {
        executor.submit(() -> processTask(task));
    }
} // auto-closes and waits for completion

// 2. Sequenced collections (JDK 21)
var list = List.of("a", "b", "c");
var first = list.getFirst();    // "a"
var last = list.getLast();      // "c"
var reversed = list.reversed(); // ["c", "b", "a"]

// 3. Pattern matching for switch (JDK 21)
String describe(Object obj) {
    return switch (obj) {
        case Integer i when i > 0 -> "positive int: " + i;
        case String s -> "string of length " + s.length();
        case null -> "null value";
        default -> "other: " + obj;
    };
}

// 4. Record patterns (JDK 21)
record Point(int x, int y) {}

if (obj instanceof Point(int x, int y)) {
    System.out.println("Point at (" + x + ", " + y + ")");
}

// 5. Structured concurrency (preview in JDK 21)
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    var userTask = scope.fork(() -> fetchUser(userId));
    var orderTask = scope.fork(() -> fetchOrders(userId));
    scope.join().throwIfFailed();
    return new UserProfile(userTask.get(), orderTask.get());
}

// 6. Math.clamp() (JDK 21)
int clamped = Math.clamp(value, 0, 100); // ensure 0 <= value <= 100
```

### Virtual Thread Migration Tips

```java
// ✅ Good candidates for virtual threads:
// - HTTP request handling (web servers)
// - Database queries and I/O operations
// - External API calls
// - File I/O operations

// ❌ Bad candidates (avoid virtual threads for):
// - CPU-intensive computation (use platform threads)
// - synchronized blocks with long operations (causes pinning)
// - Native code via JNI

// ⚠️ Watch out for virtual thread pinning:
// Replace synchronized with ReentrantLock for long I/O operations
// ❌ Pinning risk
synchronized (lock) {
    var result = httpClient.send(request, bodyHandler); // blocks carrier thread
}
// ✅ No pinning
private final ReentrantLock lock = new ReentrantLock();
lock.lock();
try {
    var result = httpClient.send(request, bodyHandler);
} finally {
    lock.unlock();
}
```

---

## Java 21 → 25

### Pre-Migration Checklist

- [ ] Review preview features in use — some stabilize in JDK 25
- [ ] Update Maven compiler plugin to 3.13+ and Gradle to 8.8+
- [ ] Check library compatibility with JDK 25 (especially byte-code manipulators)
- [ ] Review ThreadLocal usage for ScopedValue migration
- [ ] Test structured concurrency patterns (finalized in JDK 25)

### Key Changes

```java
// 1. Primitive type patterns (JDK 25)
// Pattern matching works with primitive types
Object value = 42;
if (value instanceof int i && i > 0) {
    System.out.println("Positive integer: " + i);
}

// In switch expressions
String classify(Object obj) {
    return switch (obj) {
        case int i when i > 0 -> "positive int";
        case int i -> "non-positive int";
        case double d -> "double: " + d;
        case String s -> "string: " + s;
        default -> "other";
    };
}

// 2. Flexible constructor bodies (JDK 25)
// Statements BEFORE super()/this() calls are now allowed
public class ValidatedUser extends BaseEntity {
    private final String normalizedEmail;

    public ValidatedUser(String name, String email) {
        // Pre-validation and transformation before super()
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Name must not be blank");
        }
        var normalized = email.toLowerCase().trim();
        super(name);  // can now appear after other statements
        this.normalizedEmail = normalized;
    }
}

// 3. Stream gatherers (stable in JDK 25)
// Custom intermediate stream operations
import java.util.stream.Gatherers;

// Sliding windows
var windows = List.of(1, 2, 3, 4, 5).stream()
    .gather(Gatherers.windowSliding(3))
    .toList();
// [[1, 2, 3], [2, 3, 4], [3, 4, 5]]

// Fixed-size groups
var groups = List.of(1, 2, 3, 4, 5).stream()
    .gather(Gatherers.windowFixed(2))
    .toList();
// [[1, 2], [3, 4], [5]]

// 4. Stable values (JDK 25)
// Lazy initialization with thread safety guarantees
import java.lang.StableValue;

private final StableValue<DatabaseConnection> connection =
    StableValue.supplier(() -> createConnection());

public DatabaseConnection getConnection() {
    return connection.get(); // initialized once, cached forever
}

// 5. Structured concurrency (final in JDK 25)
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    var user = scope.fork(() -> userService.findById(id));
    var orders = scope.fork(() -> orderService.findByUserId(id));
    scope.join().throwIfFailed();
    return new Dashboard(user.get(), orders.get());
}

// 6. Scoped values (final in JDK 25)
// Replaces ThreadLocal for virtual thread-friendly context
private static final ScopedValue<User> CURRENT_USER = ScopedValue.newInstance();

ScopedValue.where(CURRENT_USER, authenticatedUser).run(() -> {
    processOrder(); // CURRENT_USER.get() available in this scope
});
```

---

## Legacy API Replacement Table

| Legacy API | Modern Replacement | Since |
|---|---|---|
| `java.util.Date` | `java.time.Instant` | JDK 8 |
| `java.util.Calendar` | `java.time.LocalDate/LocalDateTime` | JDK 8 |
| `SimpleDateFormat` | `DateTimeFormatter` | JDK 8 |
| `java.util.Vector` | `List.of()` / `Collections.unmodifiableList()` | JDK 9 |
| `java.util.Hashtable` | `Map.of()` / `ConcurrentHashMap` | JDK 9 |
| `java.util.Stack` | `Deque` (ArrayDeque) | JDK 6 |
| Anonymous inner class (single method) | Lambda expression | JDK 8 |
| `Runnable` anonymous class | Method reference / lambda | JDK 8 |
| POJO (data only) | `record` | JDK 16 |
| `instanceof` + cast | Pattern matching `instanceof` | JDK 16 |
| `switch` statement (fall-through) | `switch` expression (`->`) | JDK 14 |
| String concatenation (`+` in loop) | `StringBuilder` or `String.join()` | Always |
| `HttpURLConnection` | `java.net.http.HttpClient` | JDK 11 |
| `BufferedReader.readLine()` loop | `Files.readString()` / `Files.lines()` | JDK 11 |
| `new FileInputStream(path)` | `Files.newInputStream(Path.of(path))` | JDK 7+ |
| `Executors.newFixedThreadPool(n)` | `Executors.newVirtualThreadPerTaskExecutor()` | JDK 21 |
| `ThreadLocal` (in virtual threads) | `ScopedValue` | JDK 25 |
| `synchronized` (long I/O) | `ReentrantLock` | JDK 21+ (virtual threads) |
| `Collections.unmodifiableList(new ArrayList<>(list))` | `List.copyOf(list)` | JDK 10 |
| `stream.collect(Collectors.toList())` | `stream.toList()` | JDK 16 |
| `Optional.get()` | `Optional.orElseThrow()` | JDK 10 |

---

## Build Tool Modernization

### Maven

```xml
<!-- Update compiler plugin for JDK 25 -->
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-compiler-plugin</artifactId>
    <version>3.13.0</version>
    <configuration>
        <release>25</release>
        <!-- Enable preview features if needed -->
        <!-- <compilerArgs>
            <arg>--enable-preview</arg>
        </compilerArgs> -->
    </configuration>
</plugin>

<!-- Use toolchains for multi-JDK builds -->
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-toolchains-plugin</artifactId>
    <version>3.2.0</version>
    <configuration>
        <toolchains>
            <jdk>
                <version>25</version>
            </jdk>
        </toolchains>
    </configuration>
</plugin>

<!-- JUnit 5 with Surefire -->
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-surefire-plugin</artifactId>
    <version>3.3.1</version>
</plugin>
```

### Gradle (Kotlin DSL)

```kotlin
// build.gradle.kts for JDK 25
java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}

tasks.withType<JavaCompile> {
    options.release = 25
    // options.compilerArgs.add("--enable-preview")  // if needed
}

tasks.withType<Test> {
    useJUnitPlatform()
    // jvmArgs("--enable-preview")  // if needed
}
```

---

## Module System (JPMS) Migration

### When to Adopt JPMS

- **Library authors**: Strongly recommended for encapsulation
- **Application developers**: Optional; classpath still works
- **Spring Boot apps**: Not required (Spring handles it)

### Step-by-Step

```java
// 1. Create module-info.java in src/main/java/
module com.example.myapp {
    // Dependencies
    requires java.net.http;
    requires java.sql;
    requires spring.boot;
    requires spring.boot.autoconfigure;

    // Exported packages (public API)
    exports com.example.myapp.api;
    exports com.example.myapp.model;

    // Internal packages (not exported)
    // com.example.myapp.internal stays private

    // Opens for reflection (Spring, Jackson)
    opens com.example.myapp.model to com.fasterxml.jackson.databind;
    opens com.example.myapp to spring.core;
}
```

### Common JPMS Pitfalls

```
# Split packages: two modules export the same package
# Fix: relocate one, or merge the modules

# Reflection failures: frameworks need --add-opens
# Fix: use 'opens' directive in module-info.java

# Automatic modules: unnamed JARs on module path
# Fix: use --module-path for modular JARs, --class-path for others
```

---

## Deprecation and Removal Tracker

### Removed in JDK 11
- Java EE modules (`java.xml.bind`, `java.xml.ws`, `java.activation`, `java.corba`)
- `Thread.destroy()` and `Thread.stop()`
- Applet API deprecated (removed in JDK 17)

### Removed/Changed in JDK 17
- Strong encapsulation of JDK internals enforced
- Security Manager deprecated for removal
- RMI Activation removed
- Applet API removed

### Removed/Changed in JDK 21
- `Thread.suspend()` / `Thread.resume()` throw `UnsupportedOperationException`
- Finalization deprecated for removal
- 32-bit x86 port on Windows removed

### Deprecated in JDK 25
- Primitive wrapper constructors (`new Integer(5)` → `Integer.valueOf(5)`)
- `Thread.countStackFrames()`
- Memory-access methods in `sun.misc.Unsafe` → use `VarHandle` or `MemorySegment`
