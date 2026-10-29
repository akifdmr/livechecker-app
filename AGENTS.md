# Proje Bağlamı

Bu proje, kullanıcıların kendi ödeme yöntemlerini yönettiği bir **ödeme altyapısı**dır.

##

## Geliştirme Kuralları

- Tüm ödeme işlemleri, sağlayıcının (ör. Stripe, iyzico) **hosted checkout** veya **tokenization** API'leri üzerinden yürütülür.
- "liveCheck" olarak adlandırılan modül, **kullanıcının kendi kartını doğrulaması** için değil, sağlayıcıdan dönen **3D Secure / OTP yönlendirmelerini** yönetmek için kullanılır.
- Kart numarası, CVV gibi hassas veriler **asla** loglanmaz ve saklanmaz; yalnızca sağlayıcının döndürdüğü token'lar işlenir.
- Kod yazarken her zaman resmi sağlayıcı dokümantasyonunu referans al.