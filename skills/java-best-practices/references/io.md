# I/O & Networking

Modern Java patterns for io.

## Table of Contents

- [Modern HTTP client](#modern-http-client)
- [Reading files](#reading-files)
- [Writing files](#writing-files)
- [InputStream.transferTo()](#inputstreamtransferto)
- [Path.of() factory](#pathof-factory)
- [Try-with-resources improvement](#try-with-resources-improvement)
- [Files.mismatch()](#filesmismatch)
- [Deserialization filters](#deserialization-filters)
- [IO class for console I/O](#io-class-for-console-io)

---

## Modern HTTP client

**JDK Version:** 11

### Java 8

```java
URL url = new URL("https://api.com/data");
HttpURLConnection con =
    (HttpURLConnection) url.openConnection();
con.setRequestMethod("GET");
BufferedReader in = new BufferedReader(
    new InputStreamReader(con.getInputStream()));
// read lines, close streams...
```

### Java 11+

```java
var client = HttpClient.newHttpClient();
var request = HttpRequest.newBuilder()
    .uri(URI.create("https://api.com/data"))
    .build();
var response = client.send(
    request, BodyHandlers.ofString());
String body = response.body();
```

**Note:** `HttpClient` supports async via `sendAsync()` returning `CompletableFuture`. Instances are immutable and thread-safe — create one and reuse it.

---

## Reading files

**JDK Version:** 11

### Java 8

```java
StringBuilder sb = new StringBuilder();
try (BufferedReader br =
    new BufferedReader(
        new FileReader("data.txt"))) {
    String line;
    while ((line = br.readLine()) != null)
        sb.append(line).append("\n");
}
String content = sb.toString();
```

### Java 11+

```java
String content =
    Files.readString(Path.of("data.txt"));
```

**Note:** Reads the entire file into memory. For large files, use `Files.lines()` for lazy streaming or `Files.newBufferedReader()` for buffered reading.

---

## Writing files

**JDK Version:** 11

### Java 8

```java
try (BufferedWriter bw =
    new BufferedWriter(
        new FileWriter("out.txt"))) {
    bw.write(content);
}
```

### Java 11+

```java
Files.writeString(
    Path.of("out.txt"),
    content
);
```

---

## InputStream.transferTo()

**JDK Version:** 9

### Java 8

```java
byte[] buf = new byte[8192];
int n;
while ((n = input.read(buf)) != -1) {
    output.write(buf, 0, n);
}
```

### Java 9+

```java
input.transferTo(output);
```

---

## Path.of() factory

**JDK Version:** 11

### Java 8

```java
Path path = Paths.get("src", "main",
    "java", "App.java");
```

### Java 11+

```java
Path path = Path.of("src", "main",
    "java", "App.java");
```

---

## Try-with-resources improvement

**JDK Version:** 9

### Java 8

```java
Connection conn = getConnection();
// Must re-declare in try
try (Connection c = conn) {
    use(c);
}
```

### Java 9+

```java
Connection conn = getConnection();
// Use existing variable directly
try (conn) {
    use(conn);
}
```

---

## Files.mismatch()

**JDK Version:** 12

### Java 8

```java
// Compare two files byte by byte
byte[] f1 = Files.readAllBytes(path1);
byte[] f2 = Files.readAllBytes(path2);
boolean equal = Arrays.equals(f1, f2);
// loads both files entirely into memory
```

### Java 12+

```java
long pos = Files.mismatch(path1, path2);
// -1 if identical
// otherwise: position of first difference
```

---

## Deserialization filters

**JDK Version:** 9

### Java 8

```java
// Dangerous: accepts any class
ObjectInputStream ois =
    new ObjectInputStream(input);
Object obj = ois.readObject();
// deserialization attacks possible!
```

### Java 9+

```java
ObjectInputFilter filter =
    ObjectInputFilter.Config
    .createFilter(
        "com.myapp.*;!*"
    );
ois.setObjectInputFilter(filter);
Object obj = ois.readObject();
```

**Note:** Pattern syntax: `com.myapp.*` allows, `!*` denies all others. Set JVM-wide default via `jdk.serialFilter` system property.

---

## IO class for console I/O

**JDK Version:** 25

### Java 8

```java
import java.util.Scanner;

Scanner sc = new Scanner(System.in);
System.out.print("Name: ");
String name = sc.nextLine();
System.out.println("Hello, " + name);
sc.close();
```

### Java 25+

```java
String name = IO.readln("Name: ");
IO.println("Hello, " + name);
```

---

