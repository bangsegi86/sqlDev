import java.sql.*;
import java.io.*;
import java.util.*;

public class OracleBridge {
    public static void main(String[] args) throws Exception {
        Class.forName("oracle.jdbc.OracleDriver");
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, "UTF-8"));
        PrintStream out = new PrintStream(System.out, true, "UTF-8");
        Connection conn = null;
        String line;

        while ((line = in.readLine()) != null) {
            line = line.trim();
            if (line.isEmpty()) continue;
            try {
                if (line.startsWith("CONNECT\t")) {
                    String[] p = line.split("\t", 6);
                    String url = "jdbc:oracle:thin:@//" + p[1] + ":" + p[2] + "/" + p[3];
                    Properties props = new Properties();
                    props.setProperty("user", p[4]);
                    props.setProperty("password", p[5]);
                    if (conn != null) { try { conn.close(); } catch (Exception e2) {} }
                    conn = DriverManager.getConnection(url, props);
                    conn.setAutoCommit(false);
                    out.println("OK\t" + getVersion(conn));

                } else if (line.startsWith("QUERY\t")) {
                    if (conn == null) { out.println("ERROR\tNot connected"); continue; }
                    String sql = line.substring(6);
                    out.println(executeSQL(conn, sql));

                } else if ("CLOSE".equals(line)) {
                    if (conn != null) { try { conn.close(); } catch (Exception e2) {} }
                    break;

                } else if ("PING".equals(line)) {
                    boolean alive = conn != null && !conn.isClosed();
                    out.println(alive ? "PONG" : "ERROR\tNot connected");
                }
            } catch (Exception e) {
                String msg = e.getMessage() == null ? e.getClass().getName() : e.getMessage();
                out.println("ERROR\t" + msg.replace('\n', ' ').replace('\r', ' '));
            }
        }
    }

    static String getVersion(Connection conn) throws Exception {
        try (Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery("SELECT BANNER FROM V$VERSION WHERE ROWNUM = 1")) {
            return rs.next() ? jsonStr(rs.getString(1)) : "\"Oracle Database\"";
        }
    }

    static String executeSQL(Connection conn, String sql) throws Exception {
        String up = sql.stripLeading().toUpperCase();
        if (up.startsWith("SELECT") || up.startsWith("WITH") || up.startsWith("SHOW")) {
            return runSelect(conn, sql);
        } else {
            return runDML(conn, sql);
        }
    }

    static String runSelect(Connection conn, String sql) throws Exception {
        try (Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            ResultSetMetaData meta = rs.getMetaData();
            int cols = meta.getColumnCount();
            StringBuilder sb = new StringBuilder("DATA\t{\"columns\":[");
            for (int i = 1; i <= cols; i++) {
                if (i > 1) sb.append(',');
                sb.append(jsonStr(meta.getColumnLabel(i)));
            }
            sb.append("],\"rows\":[");
            boolean first = true;
            while (rs.next()) {
                if (!first) sb.append(',');
                first = false;
                sb.append('{');
                for (int i = 1; i <= cols; i++) {
                    if (i > 1) sb.append(',');
                    sb.append(jsonStr(meta.getColumnLabel(i))).append(':');
                    sb.append(jsonVal(rs.getObject(i)));
                }
                sb.append('}');
            }
            sb.append("]}");
            return sb.toString();
        }
    }

    static String runDML(Connection conn, String sql) throws Exception {
        try (Statement st = conn.createStatement()) {
            int rows = st.executeUpdate(sql);
            conn.commit();
            return "DATA\t{\"rowsAffected\":" + rows + ",\"columns\":[],\"rows\":[]}";
        }
    }

    static String jsonStr(String s) {
        if (s == null) return "null";
        return "\"" + s.replace("\\","\\\\").replace("\"","\\\"")
                       .replace("\n","\\n").replace("\r","\\r").replace("\t","\\t") + "\"";
    }

    static String jsonVal(Object o) {
        if (o == null) return "null";
        if (o instanceof Number) return o.toString();
        if (o instanceof Boolean) return o.toString();
        if (o instanceof byte[]) return jsonStr(new String((byte[]) o));
        if (o instanceof java.sql.Clob) {
            try {
                java.sql.Clob clob = (java.sql.Clob) o;
                return jsonStr(clob.getSubString(1, (int) clob.length()));
            } catch (Exception e) { return "null"; }
        }
        return jsonStr(o.toString());
    }
}
