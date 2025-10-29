import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Lock, Database, FileText, AlertCircle, CheckCircle } from "lucide-react";
import { Link } from "wouter";

export default function PrivacyPolicy() {
  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <div className="mb-8">
          <Link href="/">
            <Button variant="ghost" className="mb-4 font-arabic" data-testid="button-back-home">
              ← العودة إلى الصفحة الرئيسية
            </Button>
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold mb-4 font-arabic-display">
            سياسة الخصوصية وحماية البيانات
          </h1>
          <p className="text-lg text-muted-foreground font-arabic">
            آخر تحديث: أكتوبر 2025
          </p>
        </div>

        {/* Introduction */}
        <Card className="mb-6 border-primary/20">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-3">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-xl font-semibold mb-2 font-arabic-display">
                  التزامنا بخصوصيتك
                </CardTitle>
                <p className="text-base leading-relaxed font-arabic text-muted-foreground">
                  نحن في منصة التوافق ملتزمون بحماية خصوصيتك وبياناتك الشخصية وفقاً لأعلى المعايير والقوانين المحلية والدولية.
                </p>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* الامتثال للقوانين */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-xl font-semibold mb-4 font-arabic-display flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              الامتثال القانوني
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 font-arabic">
            <p className="leading-relaxed">
              تلتزم منصتنا بالامتثال الكامل للقوانين واللوائح التالية:
            </p>
            <ul className="space-y-3 pr-6">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <span className="leading-relaxed">
                  <strong>نظام حماية البيانات الشخصية (PDPL)</strong> الصادر عن الهيئة السعودية للبيانات والذكاء الاصطناعي (SDAIA)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <span className="leading-relaxed">
                  <strong>قانون مكافحة الجرائم المعلوماتية</strong> في المملكة العربية السعودية
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <span className="leading-relaxed">
                  <strong>نظام التعاملات الإلكترونية</strong> السعودي
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <span className="leading-relaxed">
                  المعايير الدولية لحماية البيانات والخصوصية
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* لا نجمع معلومات خاصة */}
        <Card className="mb-6 border-green-500/30 bg-green-50/50 dark:bg-green-950/20">
          <CardHeader>
            <CardTitle className="text-xl font-semibold mb-4 font-arabic-display flex items-center gap-2">
              <Lock className="w-5 h-5 text-green-600 dark:text-green-400" />
              لا نجمع معلومات خاصة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 font-arabic">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-background border">
              <AlertCircle className="w-6 h-6 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              <p className="leading-relaxed font-semibold">
                نؤكد بشكل قاطع أننا <strong>لا نجمع أو نحفظ أي معلومات شخصية أو خاصة</strong> عن المستخدمين.
              </p>
            </div>
            <ul className="space-y-3 pr-6">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <span className="leading-relaxed">
                  <strong>لا يتم حفظ التسجيلات الصوتية:</strong> يتم تحويل الكلام إلى نص فوراً ثم حذف التسجيل الصوتي تلقائياً
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <span className="leading-relaxed">
                  <strong>بيانات مجهولة الهوية:</strong> جميع النصوص المحفوظة لا تحتوي على معلومات شخصية
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <span className="leading-relaxed">
                  <strong>الاسم اختياري:</strong> حتى حقل الاسم في نموذج الموافقة اختياري تماماً
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <span className="leading-relaxed">
                  <strong>لا نتتبع المستخدمين:</strong> لا نستخدم ملفات تعريف الارتباط التتبعية أو أي تقنيات تتبع
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* طبيعة الدراسة البحثية */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-xl font-semibold mb-4 font-arabic-display flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              طبيعة الدراسة البحثية
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 font-arabic">
            <p className="leading-relaxed">
              تم تصميم هذه المنصة لأغراض <strong>البحث العلمي والإحصائي</strong> فقط، وتستخدم البيانات المجمعة لـ:
            </p>
            <ul className="space-y-3 pr-6">
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span className="leading-relaxed">
                  <strong>الدراسات البحثية:</strong> تحليل أنماط التواصل وأساليب الوساطة لتحسين خدمات المصالحة
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span className="leading-relaxed">
                  <strong>الإحصاءات العامة:</strong> إنشاء تقارير إحصائية مجهولة الهوية لفهم احتياجات المجتمع
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span className="leading-relaxed">
                  <strong>تطوير الخدمات:</strong> تحسين جودة خدمات الوساطة والمصالحة الأسرية
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span className="leading-relaxed">
                  <strong>التدريب والتعليم:</strong> تطوير برامج تدريبية للوسطاء والمستشارين الأسريين
                </span>
              </li>
            </ul>
            <div className="p-4 rounded-lg bg-muted/50 border">
              <p className="leading-relaxed font-semibold">
                <strong>ملاحظة مهمة:</strong> جميع البيانات المستخدمة في الدراسات تكون مجهولة الهوية تماماً ولا يمكن ربطها بأي فرد محدد.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* البيانات التي نجمعها */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-xl font-semibold mb-4 font-arabic-display">
              البيانات التي نجمعها
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 font-arabic">
            <p className="leading-relaxed">
              نجمع فقط البيانات التالية <strong>بعد موافقتك الصريحة</strong>:
            </p>
            <div className="space-y-4">
              <div className="p-4 rounded-lg border bg-card">
                <h4 className="font-semibold mb-2">1. بيانات الاستبيان (مجهولة الهوية)</h4>
                <ul className="pr-6 space-y-1 text-sm">
                  <li>• تاريخ الجلسة</li>
                  <li>• عدد الأطراف</li>
                  <li>• نوع العلاقة (زوجان، أقارب، إلخ)</li>
                  <li>• وجود أطفال متأثرين (نعم/لا)</li>
                  <li>• رقم الجلسة (الأولى، الثانية، إلخ)</li>
                  <li>• طبيعة المشكلة (اختياري)</li>
                </ul>
              </div>
              <div className="p-4 rounded-lg border bg-card">
                <h4 className="font-semibold mb-2">2. النص المحول (مجهول الهوية)</h4>
                <p className="text-sm leading-relaxed">
                  نص الجلسة المحول من الكلام - <strong>بدون أي معلومات تعريفية</strong>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* حقوقك */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-xl font-semibold mb-4 font-arabic-display">
              حقوقك
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 font-arabic">
            <p className="leading-relaxed">
              وفقاً لنظام حماية البيانات الشخصية (PDPL)، لديك الحقوق التالية:
            </p>
            <ul className="space-y-2 pr-6">
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span className="leading-relaxed">الحق في إيقاف المشاركة في أي وقت دون إبداء أسباب</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span className="leading-relaxed">الحق في معرفة كيفية استخدام البيانات المجمعة</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span className="leading-relaxed">الحق في تقديم شكوى للهيئة السعودية للبيانات والذكاء الاصطناعي (SDAIA)</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* أمان البيانات */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-xl font-semibold mb-4 font-arabic-display">
              أمان البيانات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 font-arabic">
            <p className="leading-relaxed">
              نتخذ جميع التدابير الفنية والتنظيمية اللازمة لحماية البيانات:
            </p>
            <ul className="space-y-2 pr-6">
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span className="leading-relaxed">تشفير جميع البيانات المرسلة والمخزنة</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span className="leading-relaxed">حذف التسجيلات الصوتية فوراً بعد التحويل</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span className="leading-relaxed">الوصول المحدود للبيانات للباحثين المعتمدين فقط</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span className="leading-relaxed">مراجعة دورية لممارسات الأمان والخصوصية</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* للتواصل */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-xl font-semibold mb-4 font-arabic-display">
              للتواصل والاستفسارات
            </CardTitle>
          </CardHeader>
          <CardContent className="font-arabic">
            <p className="leading-relaxed mb-4">
              إذا كان لديك أي أسئلة أو استفسارات حول سياسة الخصوصية هذه، يرجى التواصل معنا.
            </p>
            <div className="p-4 rounded-lg bg-muted/50 border">
              <p className="text-sm leading-relaxed">
                <strong>ملاحظة:</strong> هذه المنصة مصممة لأغراض البحث والتطوير. مشاركتك طوعية تماماً وتساعدنا في تحسين خدمات الوساطة والمصالحة الأسرية في المجتمع.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* العودة */}
        <div className="text-center">
          <Link href="/">
            <Button size="lg" className="font-arabic" data-testid="button-return-home">
              العودة إلى الصفحة الرئيسية
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
