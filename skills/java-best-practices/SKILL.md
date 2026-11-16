---
name: java-best-practices
description: Apply modern Java best practices (JDK 8–25) when writing, reviewing, refactoring, or migrating code. Covers step-by-step workflows for language features (records, sealed classes, pattern matching, virtual threads), Spring Boot integration, testing with JUnit 5, exception handling, DTO design, and JDK migration playbooks (8→11→17→21→25). DO NOT use for non-Java languages, Android SDK, or beginner tutorials.
---

# Java Best Practices

90+ modern Java patterns (JDK 8–25) with architectural best practices for enterprise applications.

## Workflow

Determine the usage mode:

- **Writing new code** → Apply Core Principles below, then load the relevant pattern reference from the routing table
- **Reviewing/refactoring code** → Check Core Principles + load [code-quality.md](references/code-quality.md) for pitfalls and review checklist
- **Modernizing/migrating** → Load [migration-guide.md](references/migration-guide.md) for upgrade playbooks, then load pattern references as needed
- **Spring Boot application** → Load [spring-boot.md](references/spring-boot.md) for DI, transactions, config, testing, and full REST API example

## Non-Obvious Patterns

Features an LLM may not apply correctly without guidance:

```java
// Primitive type patterns in switch (JDK 25) — new, not widely known
String classify(Object obj) {
    return switch (obj) {
        case int i when i > 0 -> "positive int";
        case double d         -> "double: " + d;
        case String s         -> "string: " + s;
        default               -> "other";
    };
}

// Flexible constructor bodies (JDK 25) — statements BEFORE super()
public class ValidatedUser extends BaseEntity {
    public ValidatedUser(String name, String email) {
        var normalized = email.toLowerCase().trim(); // allowed before super() in JDK 25
        super(name);
        this.normalizedEmail = normalized;
    }
}

// Stream gatherers — custom intermediate operations (JDK 25)
var windows = List.of(1, 2, 3, 4, 5).stream()
    .gather(Gatherers.windowSliding(3))
    .toList(); // [[1,2,3], [2,3,4], [3,4,5]]

// Virtual thread pinning — replace synchronized with ReentrantLock for I/O
// ❌ synchronized blocks pin virtual threads to carrier threads
// ✅ Use ReentrantLock instead for any synchronized block containing I/O
private final ReentrantLock lock = new ReentrantLock();
lock.lock();
try { var r = httpClient.send(req, handler); } finally { lock.unlock(); }
```

## Core Principles

### 1. Favor Modern Java Features (JDK 8-25)
- Use Records for data-only classes, pattern matching for type checks, `var` for clear local types
- Prefer immutable collections (`List.of()`, `Map.of()`, `Stream.toList()`)
- Adopt virtual threads for I/O (JDK 21+), primitive patterns and flexible constructors (JDK 25+)

### 2. Test-Driven Development (TDD)
- Write tests first (Red-Green-Refactor); use AAA pattern (Arrange-Act-Assert)
- Name tests descriptively: `shouldCalculateTotalWhenMultipleItems`
- JUnit 5 + AssertJ + Mockito for unit tests; TestContainers for integration
- See [testing.md](references/testing.md) for patterns and [spring-boot.md](references/spring-boot.md) for integration test examples

### 3. Validate First, Catch Never
- Prevent bad data at the boundary using `@Valid` and validation annotations
- Make illegal states unrepresentable with Records and sealed types

### 4. Use Unchecked Exceptions
- Default to `RuntimeException`; wrap checked exceptions from libraries
- Use exception chaining to preserve stack traces

### 5. Centralize Exception Handling
- `@RestControllerAdvice` for global handling; build a self-explanatory exception hierarchy
- Never use empty catch blocks or generic `catch (Exception e)`

### 6. Result Objects for Expected Cases
- Use `Optional<T>` for expected absence; reserve exceptions for truly exceptional conditions
- Prefer `orElseThrow()` over `get()`; use chaining methods (`or`, `ifPresentOrElse`)

### 7. Know Your JDK Version
- Target LTS versions: JDK 8, 11, 17, 21, 25
- Use preview features cautiously (`--enable-preview`)
- See [migration-guide.md](references/migration-guide.md) for upgrade playbooks (8→11→17→21→25)

## Reference Routing

Match the user's request to the appropriate reference file:

| Domain | Triggers | Reference |
|---|---|---|
| Language features | Records, pattern matching, var, sealed classes, switch expressions, text blocks, primitive patterns | [language.md](references/language.md) (18 patterns) |
| Collections | List.of, Map.of, immutability, sequenced collections | [collections.md](references/collections.md) (9 patterns) |
| Streams/Optional | Collection processing, null safety, Predicate.not, gatherers | [streams.md](references/streams.md) (11 patterns) |
| Concurrency | Virtual threads, async, structured concurrency, scoped values | [concurrency.md](references/concurrency.md) (10 patterns) |
| I/O/Networking | HTTP client, files, Path.of, try-with-resources | [io.md](references/io.md) (9 patterns) |
| Strings | Text blocks, formatting, isBlank, strip, repeat | [strings.md](references/strings.md) (8 patterns) |
| Error handling | Exceptions, Optional, NPE, multi-catch | [errors.md](references/errors.md) (7 patterns) |
| Date/time | Temporal operations, Duration, formatting | [datetime.md](references/datetime.md) (6 patterns) |
| Security | Crypto, random, TLS, PEM | [security.md](references/security.md) (5 patterns) |
| Tooling | Execution, profiling, jshell, JFR | [tooling.md](references/tooling.md) (7 patterns) |
| Testing/TDD | JUnit 5, Mockito, AssertJ, TestContainers, AAA pattern, parameterized tests, test builders | [testing.md](references/testing.md) |
| DTOs/APIs | REST request/response design | [dto-patterns.md](references/dto-patterns.md) |
| Exception strategy | Exception hierarchies, @ControllerAdvice, Result objects | [exception-handling.md](references/exception-handling.md) |
| Code quality | Naming, bug patterns, code smells, pitfalls, review checklist | [code-quality.md](references/code-quality.md) |
| Migration | JDK upgrades (8→11→17→21→25), API replacements, build modernization, JPMS | [migration-guide.md](references/migration-guide.md) |
| Spring Boot | Constructor DI, @Transactional, @ConfigurationProperties, virtual threads, actuator, full REST API example | [spring-boot.md](references/spring-boot.md) |

Each pattern reference shows old vs. modern approach with minimum JDK version. Always note the JDK version requirement when suggesting modern features.

### JDK Version Quick Reference

- **JDK 8**: Streams, Lambdas, Optional, java.time
- **JDK 9**: Immutable collections (List.of, Map.of)
- **JDK 10**: Type inference (var)
- **JDK 11**: HTTP Client, Files.readString/writeString
- **JDK 14**: Helpful NullPointerExceptions, switch expressions
- **JDK 15**: Text blocks
- **JDK 16**: Pattern matching for instanceof, Records, Stream.toList()
- **JDK 17** (LTS): Sealed classes (stable), RandomGenerator, HexFormat
- **JDK 21** (LTS): Virtual threads, structured concurrency, sequenced collections, Math.clamp()
- **JDK 24**: Multi-file source programs, stable values, gatherers (stable)
- **JDK 25** (LTS): Primitive type patterns, flexible constructor bodies, stream gatherers API refinements

## Build Verification

After modifying code, verify the build: `mvn clean install` (Maven) or `./gradlew build` (Gradle).
