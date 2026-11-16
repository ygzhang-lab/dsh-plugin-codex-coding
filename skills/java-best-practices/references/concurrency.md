# Concurrency

Modern Java patterns for concurrency.

## Table of Contents

- [Virtual threads](#virtual-threads)
- [Structured concurrency](#structured-concurrency)
- [Scoped values](#scoped-values)
- [Stable values](#stable-values)
- [CompletableFuture chaining](#completablefuture-chaining)
- [ExecutorService auto-close](#executorservice-auto-close)
- [Thread.sleep with Duration](#threadsleep-with-duration)
- [Modern Process API](#modern-process-api)
- [Concurrent HTTP with virtual threads](#concurrent-http-with-virtual-threads)
- [Lock-free lazy initialization](#lock-free-lazy-initialization)

---

## Virtual threads

**JDK Version:** 21

### Java 8

```java
Thread thread = new Thread(() -> {
    System.out.println("hello");
});
thread.start();
thread.join();
```

### Java 21+

```java
Thread.startVirtualThread(() -> {
    System.out.println("hello");
}).join();
```

**Note:** Virtual threads should not be pooled — create a new one per task. Avoid `synchronized` blocks in virtual thread code (causes pinning); use `ReentrantLock` instead.

---

## Structured concurrency

**JDK Version:** 25

### Java 8

```java
ExecutorService exec =
    Executors.newFixedThreadPool(2);
Future<User> u = exec.submit(this::fetchUser);
Future<Order> o = exec.submit(this::fetchOrder);
try {
    return combine(u.get(), o.get());
} finally { exec.shutdown(); }
```

### Java 25 (Preview)

```java
try (var scope = new StructuredTaskScope
        .ShutdownOnFailure()) {
    var u = scope.fork(this::fetchUser);
    var o = scope.fork(this::fetchOrder);
    scope.join().throwIfFailed();
    return combine(u.get(), o.get());
}
```

**Note:** Preview feature (JDK 25). `ShutdownOnFailure` cancels all subtasks on first failure. `ShutdownOnSuccess` returns the first successful result.

---

## Scoped values

**JDK Version:** 25

### Java 8

```java
static final ThreadLocal<User> CURRENT =
    new ThreadLocal<>();
void handle(Request req) {
    CURRENT.set(authenticate(req));
    try { process(); }
    finally { CURRENT.remove(); }
}
```

### Java 25

```java
static final ScopedValue<User> CURRENT =
    ScopedValue.newInstance();
void handle(Request req) {
    ScopedValue.where(CURRENT,
        authenticate(req)
    ).run(this::process);
}
```

---

## Stable values

**JDK Version:** 25

### Java 8

```java
private volatile Logger logger;
Logger getLogger() {
    if (logger == null) {
        synchronized (this) {
            if (logger == null)
                logger = createLogger();
        }
    }
    return logger;
}
```

### Java 25 (Preview)

```java
private final StableValue<Logger> logger =
    StableValue.of(this::createLogger);

Logger getLogger() {
    return logger.get();
}
```

---

## CompletableFuture chaining

**JDK Version:** 8

### Pre-Java 8

```java
Future<String> future =
    executor.submit(this::fetchData);
String data = future.get(); // blocks
String result = transform(data);
```

### Java 8+

```java
CompletableFuture.supplyAsync(
    this::fetchData
)
.thenApply(this::transform)
.thenAccept(System.out::println);
```

---

## ExecutorService auto-close

**JDK Version:** 19

### Java 8

```java
ExecutorService exec =
    Executors.newCachedThreadPool();
try {
    exec.submit(task);
} finally {
    exec.shutdown();
    exec.awaitTermination(
        1, TimeUnit.MINUTES);
}
```

### Java 19+

```java
try (var exec =
        Executors.newCachedThreadPool()) {
    exec.submit(task);
}
// auto shutdown + await on close
```

---

## Thread.sleep with Duration

**JDK Version:** 19

### Java 8

```java
// What unit is 5000? ms? us?
Thread.sleep(5000);

// 2.5 seconds: math required
Thread.sleep(2500);
```

### Java 19+

```java
Thread.sleep(
    Duration.ofSeconds(5)
);
Thread.sleep(
    Duration.ofMillis(2500)
);
```

---

## Modern Process API

**JDK Version:** 9

### Java 8

```java
Process p = Runtime.getRuntime()
    .exec("ls -la");
int code = p.waitFor();
// no way to get PID
// no easy process info
```

### Java 9+

```java
ProcessHandle ph =
    ProcessHandle.current();
long pid = ph.pid();
ph.info().command()
    .ifPresent(System.out::println);
ph.children().forEach(
    c -> System.out.println(c.pid()));
```

---

## Concurrent HTTP with virtual threads

**JDK Version:** 21

### Java 8

```java
ExecutorService pool =
    Executors.newFixedThreadPool(10);
List<Future<String>> futures =
    urls.stream()
    .map(u -> pool.submit(
        () -> fetchUrl(u)))
    .toList();
// manual shutdown, blocking get()
```

### Java 21+

```java
try (var exec = Executors
    .newVirtualThreadPerTaskExecutor()) {
    var results = urls.stream()
        .map(u -> exec.submit(
            () -> client.send(req(u),
                ofString()).body()))
        .toList().stream()
        .map(Future::join).toList();
}
```

---

## Lock-free lazy initialization

**JDK Version:** 25

### Java 8

```java
class Config {
    private static volatile Config inst;
    static Config get() {
        if (inst == null) {
            synchronized (Config.class) {
                if (inst == null)
                    inst = load();
            }
        }
        return inst;
    }
}
```

### Java 25 (Preview)

```java
class Config {
    private static final
        StableValue<Config> INST =
            StableValue.of(Config::load);

    static Config get() {
        return INST.get();
    }
}
```

---

