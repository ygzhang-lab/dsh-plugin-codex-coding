# Strings

Modern Java patterns for strings.

## Table of Contents

- [String.isBlank()](#stringisblank)
- [String.strip() vs trim()](#stringstrip-vs-trim)
- [String.repeat()](#stringrepeat)
- [String.indent() and transform()](#stringindent-and-transform)
- [String.formatted()](#stringformatted)
- [Multiline JSON/SQL/HTML](#multiline-jsonsqlhtml)
- [String chars as stream](#string-chars-as-stream)
- [String.lines() for line splitting](#stringlines-for-line-splitting)

---

## String.isBlank()

**JDK Version:** 11

### Java 8

```java
boolean blank =
    str.trim().isEmpty();
// or: str.trim().length() == 0
```

### Java 11+

```java
boolean blank = str.isBlank();
// handles Unicode whitespace too
```

---

## String.strip() vs trim()

**JDK Version:** 11

### Java 8

```java
// trim() only removes ASCII whitespace
// (chars <= U+0020)
String clean = str.trim();
```

### Java 11+

```java
// strip() removes all Unicode whitespace
String clean = str.strip();
String left  = str.stripLeading();
String right = str.stripTrailing();
```

---

## String.repeat()

**JDK Version:** 11

### Java 8

```java
StringBuilder sb = new StringBuilder();
for (int i = 0; i < 3; i++) {
    sb.append("abc");
}
String result = sb.toString();
```

### Java 11+

```java
String result = "abc".repeat(3);
// "abcabcabc"
```

---

## String.indent() and transform()

**JDK Version:** 12

### Java 8

```java
String[] lines = text.split("\n");
StringBuilder sb = new StringBuilder();
for (String line : lines) {
    sb.append("    ").append(line)
      .append("\n");
}
String indented = sb.toString();
```

### Java 12+

```java
String indented = text.indent(4);

String result = text
    .transform(String::strip)
    .transform(s -> s.replace(" ", "-"));
```

**Note:** `indent(n)` also normalizes line endings and adds a trailing newline. Negative `n` removes leading spaces.

---

## String.formatted()

**JDK Version:** 15

### Java 8

```java
String msg = String.format(
    "Hello %s, you are %d",
    name, age
);
```

### Java 15+

```java
String msg =
    "Hello %s, you are %d"
    .formatted(name, age);
```

---

## Multiline JSON/SQL/HTML

**JDK Version:** 15

### Java 8

```java
String sql =
    "SELECT u.name, u.email\n" +
    "FROM users u\n" +
    "WHERE u.active = true\n" +
    "ORDER BY u.name";
```

### Java 15+

```java
String sql = """
    SELECT u.name, u.email
    FROM users u
    WHERE u.active = true
    ORDER BY u.name""";
```

---

## String chars as stream

**JDK Version:** 9

### Java 8

```java
for (int i = 0; i < str.length(); i++) {
    char c = str.charAt(i);
    if (Character.isDigit(c)) {
        process(c);
    }
}
```

### Java 9+

```java
str.chars()
    .filter(Character::isDigit)
    .forEach(c -> process((char) c));
```

---

## String.lines() for line splitting

**JDK Version:** 11

### Java 8

```java
String text = "one\ntwo\nthree";
String[] lines = text.split("\n");
for (String line : lines) {
    System.out.println(line);
}
```

### Java 11+

```java
String text = "one\ntwo\nthree";
text.lines().forEach(System.out::println);
```

---

