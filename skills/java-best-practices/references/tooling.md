# Tooling & Runtime

Modern Java patterns for tooling.

## Table of Contents

- [JShell for prototyping](#jshell-for-prototyping)
- [Single-file execution](#single-file-execution)
- [Multi-file source launcher](#multi-file-source-launcher)
- [JFR for profiling](#jfr-for-profiling)
- [Compact object headers](#compact-object-headers)
- [AOT class preloading](#aot-class-preloading)
- [Built-in HTTP server](#built-in-http-server)

---

## JShell for prototyping

**JDK Version:** 9

### Java 8

```java
// 1. Create Test.java
// 2. javac Test.java
// 3. java Test
// Just to test one expression!
```

### Java 9+

```java
$ jshell
jshell> "hello".chars().count()
$1 ==> 5
jshell> List.of(1,2,3).reversed()
$2 ==> [3, 2, 1]
```

---

## Single-file execution

**JDK Version:** 11

### Java 8

```java
$ javac HelloWorld.java
$ java HelloWorld
// Two steps every time
```

### Java 11+

```java
$ java HelloWorld.java
// Compiles and runs in one step
// Also works with shebangs:
#!/usr/bin/java --source 25
```

---

## Multi-file source launcher

**JDK Version:** 22

### Java 8

```java
$ javac *.java
$ java Main
// Must compile all files first
// Need a build tool for dependencies
```

### Java 22+

```java
$ java Main.java
// Automatically finds and compiles
// other source files referenced
// by Main.java
```

---

## JFR for profiling

**JDK Version:** 9

### Java 8

```java
// Install VisualVM / YourKit / JProfiler
// Attach to running process
// Configure sampling
// Export and analyze
// External tool required
```

### Java 9+

```java
// Start with profiling enabled
$ java -XX:StartFlightRecording=
    filename=rec.jfr MyApp

// Or attach to running app:
$ jcmd <pid> JFR.start
```

**Note:** ~1% performance overhead — safe for production. Analyze recordings with JDK Mission Control (`jmc`) or programmatically via the JFR API.

---

## Compact object headers

**JDK Version:** 25

### Java 8

```java
// Default: 128-bit object header
// = 16 bytes overhead per object
// A boolean field object = 32 bytes!
// Mark word (64) + Klass pointer (64)
```

### Java 25

```java
// -XX:+UseCompactObjectHeaders
// 64-bit object header
// = 8 bytes overhead per object
// 50% less header memory
// More objects fit in cache
```

---

## AOT class preloading

**JDK Version:** 25

### Java 8

```java
// Every startup:
// - Load 10,000+ classes
// - Verify bytecode
// - JIT compile hot paths
// Startup: 2-5 seconds
```

### Java 25

```java
// Training run:
$ java -XX:AOTCacheOutput=app.aot \
    -cp app.jar com.App
// Production:
$ java -XX:AOTCache=app.aot \
    -cp app.jar com.App
```

**Note:** Requires a training run first. The cache is specific to the exact classpath and JVM version used during training.

---

## Built-in HTTP server

**JDK Version:** 18

### Java 8

```java
// Install and configure a web server
// (Apache, Nginx, or embedded Jetty)

// Or write boilerplate with com.sun.net.httpserver
HttpServer server = HttpServer.create(
    new InetSocketAddress(8080), 0);
server.createContext("/", exchange -> { ... });
server.start();
```

### Java 18+

```java
// Terminal: serve current directory
$ jwebserver

// Or use the API (JDK 18+)
var server = SimpleFileServer.createFileServer(
    new InetSocketAddress(8080),
    Path.of("."),
    OutputLevel.VERBOSE);
server.start();
```

---

