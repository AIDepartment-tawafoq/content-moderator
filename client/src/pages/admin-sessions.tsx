import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Download, LogOut, FileText } from "lucide-react";
import type { Session } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function AdminSessions() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const auth = localStorage.getItem("admin-authenticated");
    if (auth !== "true") {
      setLocation("/admin/login");
    } else {
      setIsAuthenticated(true);
    }
  }, [setLocation]);

  const { data: sessions, isLoading } = useQuery<Session[]>({
    queryKey: ["/api/admin/sessions"],
    enabled: isAuthenticated,
    queryFn: async () => {
      const response = await fetch("/api/admin/sessions", {
        headers: {
          Authorization: "Bearer admin-authenticated",
        },
      });
      if (!response.ok) {
        throw new Error("فشل في جلب الجلسات");
      }
      return response.json();
    },
  });

  const handleLogout = () => {
    localStorage.removeItem("admin-authenticated");
    toast({
      title: "تم تسجيل الخروج بنجاح",
    });
    setLocation("/admin/login");
  };

  const handleExportCSV = async () => {
    try {
      const response = await fetch("/api/admin/sessions/export", {
        headers: {
          Authorization: "Bearer admin-authenticated",
        },
      });
      
      if (!response.ok) {
        throw new Error("فشل في تصدير الجلسات");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sessions-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "تم التصدير بنجاح",
        description: "تم تحميل ملف CSV",
      });
    } catch (error: any) {
      toast({
        title: "خطأ في التصدير",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      pending: "secondary",
      recording: "default",
      completed: "default",
    };
    const labels: Record<string, string> = {
      pending: "قيد الانتظار",
      recording: "يتم التسجيل",
      completed: "مكتمل",
    };
    return (
      <Badge variant={variants[status] || "secondary"}>
        {labels[status] || status}
      </Badge>
    );
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">إدارة الجلسات</CardTitle>
                  <CardDescription>
                    عرض وتصدير جميع جلسات التسجيل
                  </CardDescription>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleExportCSV}
                  variant="default"
                  data-testid="button-export-csv"
                >
                  <Download className="w-4 h-4 ml-2" />
                  تصدير CSV
                </Button>
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  data-testid="button-logout"
                >
                  <LogOut className="w-4 h-4 ml-2" />
                  تسجيل الخروج
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">جاري تحميل الجلسات...</p>
              </div>
            ) : !sessions || sessions.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">لا توجد جلسات مسجلة</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">المعرف</TableHead>
                      <TableHead className="text-right">اسم المشارك</TableHead>
                      <TableHead className="text-right">تاريخ الجلسة</TableHead>
                      <TableHead className="text-right">عدد الأطراف</TableHead>
                      <TableHead className="text-right">نوع العلاقة</TableHead>
                      <TableHead className="text-right">رقم الجلسة</TableHead>
                      <TableHead className="text-right">طبيعة المشكلة</TableHead>
                      <TableHead className="text-right">النص المحول</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">تاريخ الإنشاء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((session) => (
                      <TableRow key={session.id} data-testid={`row-session-${session.id}`}>
                        <TableCell className="font-mono text-xs">
                          {session.id.substring(0, 8)}...
                        </TableCell>
                        <TableCell>{session.participantName || "-"}</TableCell>
                        <TableCell>
                          {session.sessionDate
                            ? new Date(session.sessionDate).toLocaleDateString("ar-SA")
                            : "-"}
                        </TableCell>
                        <TableCell>{session.participantsCount}</TableCell>
                        <TableCell>{session.relationType}</TableCell>
                        <TableCell>{session.sessionNumber}</TableCell>
                        <TableCell>{session.problemNature || "-"}</TableCell>
                        <TableCell className="max-w-xs">
                          {session.transcribedText ? (
                            <div className="truncate" title={session.transcribedText}>
                              {session.transcribedText}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">فارغ</span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(session.status)}</TableCell>
                        <TableCell>
                          {new Date(session.createdAt).toLocaleDateString("ar-SA")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {sessions && sessions.length > 0 && (
              <div className="mt-4 text-sm text-muted-foreground text-center">
                إجمالي الجلسات: {sessions.length}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
