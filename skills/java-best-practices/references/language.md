# Language Features

Modern Java patterns for language.

## Table of Contents

- [Type inference with var](#type-inference-with-var)
- [Text blocks for multiline strings](#text-blocks-for-multiline-strings)
- [Switch expressions](#switch-expressions)
- [Pattern matching for instanceof](#pattern-matching-for-instanceof)
- [Records for data classes](#records-for-data-classes)
- [Sealed classes for type hierarchies](#sealed-classes-for-type-hierarchies)
- [Record patterns (destructuring)](#record-patterns-destructuring)
- [Unnamed variables with _](#unnamed-variables-with-_)
- [Compact source files](#compact-source-files)
- [Flexible constructor bodies](#flexible-constructor-bodies)
- [Diamond with anonymous classes](#diamond-with-anonymous-classes)
- [Private interface methods](#private-interface-methods)
- [Pattern matching in switch](#pattern-matching-in-switch)
- [Guarded patterns with when](#guarded-patterns-with-when)
- [Primitive types in patterns](#primitive-types-in-patterns)
- [Module import declarations](#module-import-declarations)
- [Exhaustive switch without default](#exhaustive-switch-without-default)
- [Default interface methods](#default-interface-methods)

---

## Type inference with var

**JDK Version:** 10

### Java 8

```java
Map<String, List<Integer>> map =
    new HashMap<String, List<Integer>>();
for (Map.Entry<String, List<Integer>> e
    : map.entrySet()) {
    // verbose type noise
}
```

### Java 10+

```java
var map = new HashMap<String, List<Integer>>();
for (var entry : map.entrySet()) {
    // clean and readable
}
```

**Note:** Avoid `var` when the type isn't obvious from the right-hand side (e.g., `var result = process()`). Cannot be used for fields, method parameters, or return types.

---

## Text blocks for multiline strings

**JDK Version:** 15

### Java 8

```java
String json = "{\n" +
    "  \"name\": \"Duke\",\n" +
    "  \"age\": 30\n" +
    "}";
```

### Java 15+

```java
String json = """
    {
      "name": "Duke",
      "age": 30
    }""";
```

**Note:** The closing delimiter position controls indentation stripping. Content is aligned relative to the `"""` position.

---

## Switch expressions

**JDK Version:** 14

### Java 8

```java
String msg;
switch (day) {
    case MONDAY:
        msg = "Start";
        break;
    case FRIDAY:
        msg = "End";
        break;
    default:
        msg = "Mid";
}
```

### Java 14+

```java
String msg = switch (day) {
    case MONDAY  -> "Start";
    case FRIDAY  -> "End";
    default      -> "Mid";
};
```

---

## Pattern matching for instanceof

**JDK Version:** 16

### Java 8

```java
if (obj instanceof String) {
    String s = (String) obj;
    System.out.println(s.length());
}
```

### Java 16+

```java
if (obj instanceof String s) {
    System.out.println(s.length());
}
```

---

## Records for data classes

**JDK Version:** 16

### Java 8

```java
public class Point {
    private final int x, y;
    public Point(int x, int y) { ... }
    public int getX() { return x; }
    public int getY() { return y; }
    // equals, hashCode, toString
}
```

### Java 16+

```java
public record Point(int x, int y) {}
```

**Note:** Accessors use `x()` not `getX()`. Records are implicitly `final`. Add compact constructors for validation: `public Point { if (x < 0) throw new IAE(); }`.

---

## Sealed classes for type hierarchies

**JDK Version:** 17

### Java 8

```java
// Anyone can extend Shape
public abstract class Shape { }
public class Circle extends Shape { }
public class Rect extends Shape { }
// unknown subclasses possible
```

### Java 17+

```java
public sealed interface Shape
    permits Circle, Rect {}
public record Circle(double r)
    implements Shape {}
public record Rect(double w, double h)
    implements Shape {}
```

**Note:** Permitted subtypes must be in the same package (or module). Subtypes must be `final`, `sealed`, or `non-sealed`.

---

## Record patterns (destructuring)

**JDK Version:** 21

### Java 8

```java
if (obj instanceof Point) {
    Point p = (Point) obj;
    int x = p.getX();
    int y = p.getY();
    System.out.println(x + y);
}
```

### Java 21+

```java
if (obj instanceof Point(int x, int y)) {
    System.out.println(x + y);
}
```

---

## Unnamed variables with _

**JDK Version:** 22

### Java 8

```java
try {
    parse(input);
} catch (Exception ignored) {
    log("parse failed");
}
map.forEach((key, value) -> {
    process(value); // key unused
});
```

### Java 22+

```java
try {
    parse(input);
} catch (Exception _) {
    log("parse failed");
}
map.forEach((_, value) -> {
    process(value);
});
```

---

## Compact source files

**JDK Version:** 25

### Java 8

```java
public class HelloWorld {
    public static void main(
            String[] args) {
        System.out.println(
            "Hello, World!");
    }
}
```

### Java 25

```java
void main() {
    IO.println("Hello, World!");
}
```

**Note:** Preview feature (JDK 25). The implicit class cannot be referenced by name and cannot have static members.

---

## Flexible constructor bodies

**JDK Version:** 25

### Java 8

```java
class Square extends Shape {
    Square(double side) {
        super(side, side);
        // can't validate BEFORE super!
        if (side <= 0)
            throw new IAE("bad");
    }
}
```

### Java 25+

```java
class Square extends Shape {
    Square(double side) {
        if (side <= 0)
            throw new IAE("bad");
        super(side, side);
    }
}
```

---

## Diamond with anonymous classes

**JDK Version:** 9

### Java 7/8

```java
Map<String, List<String>> map =
    new HashMap<String, List<String>>();
// anonymous class: no diamond
Predicate<String> p =
    new Predicate<String>() {
        public boolean test(String s) {..}
    };
```

### Java 9+

```java
Map<String, List<String>> map =
    new HashMap<>();
// Java 9: diamond with anonymous classes
Predicate<String> p =
    new Predicate<>() {
        public boolean test(String s) {..}
    };
```

---

## Private interface methods

**JDK Version:** 9

### Java 8

```java
interface Logger {
    default void logInfo(String msg) {
        System.out.println(
            "[INFO] " + timestamp() + msg);
    }
    default void logWarn(String msg) {
        System.out.println(
            "[WARN] " + timestamp() + msg);
    }
}
```

### Java 9+

```java
interface Logger {
    private String format(String lvl, String msg) {
        return "[" + lvl + "] " + timestamp() + msg;
    }
    default void logInfo(String msg) {
        System.out.println(format("INFO", msg));
    }
    default void logWarn(String msg) {
        System.out.println(format("WARN", msg));
    }
}
```

---

## Pattern matching in switch

**JDK Version:** 21

### Java 8

```java
String format(Object obj) {
    if (obj instanceof Integer i)
        return "int: " + i;
    else if (obj instanceof Double d)
        return "double: " + d;
    else if (obj instanceof String s)
        return "str: " + s;
    return "unknown";
}
```

### Java 21+

```java
String format(Object obj) {
    return switch (obj) {
        case Integer i -> "int: " + i;
        case Double d  -> "double: " + d;
        case String s  -> "str: " + s;
        default        -> "unknown";
    };
}
```

---

## Guarded patterns with when

**JDK Version:** 21

### Java 8

```java
if (shape instanceof Circle c) {
    if (c.radius() > 10) {
        return "large circle";
    } else {
        return "small circle";
    }
} else {
    return "not a circle";
}
```

### Java 21+

```java
return switch (shape) {
    case Circle c
        when c.radius() > 10
            -> "large circle";
    case Circle c
            -> "small circle";
    default -> "not a circle";
};
```

---

## Primitive types in patterns

**JDK Version:** 25

### Java 8

```java
String classify(int code) {
    if (code >= 200 && code < 300)
        return "success";
    else if (code >= 400 && code < 500)
        return "client error";
    else
        return "other";
}
```

### Java 25 (Preview)

```java
String classify(int code) {
    return switch (code) {
        case int c when c >= 200
            && c < 300 -> "success";
        case int c when c >= 400
            && c < 500 -> "client error";
        default -> "other";
    };
}
```

---

## Module import declarations

**JDK Version:** 25

### Java 8

```java
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
```

### Java 25+

```java
import module java.base;

// All of java.util, java.io, java.nio
// etc. available in one line
```

**Note:** Preview feature (JDK 25). May cause ambiguity if multiple modules export same-named classes.

---

## Exhaustive switch without default

**JDK Version:** 21

### Java 8

```java
// Must add default even though
// all cases are covered
double area(Shape s) {
    if (s instanceof Circle c)
        return Math.PI * c.r() * c.r();
    else if (s instanceof Rect r)
        return r.w() * r.h();
    else throw new IAE();
}
```

### Java 21+

```java
// sealed Shape permits Circle, Rect
double area(Shape s) {
    return switch (s) {
        case Circle c ->
            Math.PI * c.r() * c.r();
        case Rect r ->
            r.w() * r.h();
    }; // no default needed!
}
```

---

## Default interface methods

**JDK Version:** 8

### Java 7

```java
// Need abstract class to share behavior
public abstract class AbstractLogger {
    public void log(String msg) {
        System.out.println(
            timestamp() + ": " + msg);
    }
    abstract String timestamp();
}

// Single inheritance only
public class FileLogger
    extends AbstractLogger { ... }
```

### Java 8+

```java
public interface Logger {
    default void log(String msg) {
        System.out.println(
            timestamp() + ": " + msg);
    }
    String timestamp();
}

// Multiple interfaces allowed
public class FileLogger
    implements Logger, Closeable { ... }
```

---

