/* ==================== 主交互逻辑 ==================== */
(function () {
    "use strict";

    /* ---------- DOM 引用 ---------- */
    var bannerSlides = document.getElementById("bannerSlides");
    var bannerDots = document.getElementById("bannerDots");
    var bannerPrev = document.getElementById("bannerPrev");
    var bannerNext = document.getElementById("bannerNext");
    var caseGrid = document.getElementById("caseGrid");
    var noResult = document.getElementById("noResult");
    var filterBar = document.getElementById("filterBar");
    var modalOverlay = document.getElementById("modalOverlay");
    var modalBody = document.getElementById("modalBody");
    var modalClose = document.getElementById("modalClose");
    var backTop = document.getElementById("backTop");
    var menuToggle = document.getElementById("menuToggle");
    var mainNav = document.getElementById("mainNav");
    var navLinks = document.querySelectorAll(".nav-link");

    var currentFilter = "all";
    var currentSlide = 0;
    var slideTimer = null;

    /* ---------- 1. 轮播 Banner ---------- */
    var slides = document.querySelectorAll(".banner-slide");
    var dots = document.querySelectorAll(".banner-dot");

    function goToSlide(index) {
        if (index < 0) index = slides.length - 1;
        if (index >= slides.length) index = 0;
        slides[currentSlide].classList.remove("active");
        dots[currentSlide].classList.remove("active");
        currentSlide = index;
        slides[currentSlide].classList.add("active");
        dots[currentSlide].classList.add("active");
    }

    function startAutoPlay() {
        stopAutoPlay();
        slideTimer = setInterval(function () {
            goToSlide(currentSlide + 1);
        }, 5000);
    }

    function stopAutoPlay() {
        if (slideTimer) clearInterval(slideTimer);
    }

    if (bannerPrev) bannerPrev.addEventListener("click", function () { goToSlide(currentSlide - 1); startAutoPlay(); });
    if (bannerNext) bannerNext.addEventListener("click", function () { goToSlide(currentSlide + 1); startAutoPlay(); });

    dots.forEach(function (dot) {
        dot.addEventListener("click", function () {
            goToSlide(parseInt(this.getAttribute("data-slide")));
            startAutoPlay();
        });
    });

    // 鼠标悬停暂停
    var banner = document.getElementById("banner");
    if (banner) {
        banner.addEventListener("mouseenter", stopAutoPlay);
        banner.addEventListener("mouseleave", startAutoPlay);
    }

    startAutoPlay();

    /* ---------- 2. 渲染案例卡片 ---------- */
    function renderCases(filter) {
        var html = "";
        var count = 0;
        CASES.forEach(function (c) {
            if (filter === "all" || c.category === filter) {
                html += ''
                    + '<div class="case-card" data-id="' + c.id + '">'
                    + '  <div class="case-card-img">'
                    + '    <img src="' + c.cover + '" alt="' + c.title + '" loading="lazy" onerror="this.src=\'https://via.placeholder.com/600x400/0052cc/ffffff?text=HPS\'">'
                    + '    <span class="case-card-badge">' + c.categoryName + '</span>'
                    + '  </div>'
                    + '  <div class="case-card-body">'
                    + '    <h3 class="case-card-title">' + c.title + '</h3>'
                    + '    <p class="case-card-company">' + c.company + ' · ' + c.level + '</p>'
                    + '    <div class="case-card-tags">'
                    + c.tags.map(function (t) { return '<span class="case-tag">' + t + '</span>'; }).join("")
                    + '    </div>'
                    + '    <div class="case-card-result">'
                    + c.results.map(function (r) {
                        return '<div class="case-result-item"><div class="case-result-num">' + r.num + '</div><div class="case-result-label">' + r.label + '</div></div>';
                    }).join("")
                    + '    </div>'
                    + '  </div>'
                    + '</div>';
                count++;
            }
        });
        caseGrid.innerHTML = html;
        noResult.style.display = count === 0 ? "block" : "none";

        // 绑定卡片点击
        document.querySelectorAll(".case-card").forEach(function (card) {
            card.addEventListener("click", function () {
                openModal(parseInt(this.getAttribute("data-id")));
            });
        });
    }

    /* ---------- 3. 更新分类计数 ---------- */
    function updateCounts() {
        var counts = { all: 0, yield: 0, substitute: 0, reduce: 0, headcount: 0, hours: 0, utilities: 0, auxiliary: 0, spare_parts: 0, indirect_staff: 0 };
        CASES.forEach(function (c) {
            counts.all++;
            if (counts[c.category] !== undefined) counts[c.category]++;
        });

        // 旧版 ID（兼容保留）
        var map = { all: "countAll", yield: "countYield", substitute: "countSubstitute", reduce: "countReduce", headcount: "countHeadcount", hours: "countHours", utilities: "countUtilities", auxiliary: "countAuxiliary", spare_parts: "countSpareParts", indirect_staff: "countIndirectStaff" };
        for (var key in map) {
            var el = document.getElementById(map[key]);
            if (el) el.textContent = counts[key];
        }

        // 新版 PC 卡片徽章
        var pcMap = { yield: "pillYield", substitute: "pillSubstitute", reduce: "pillReduce", headcount: "pillHeadcount", hours: "pillHours", utilities: "pillUtilities", auxiliary: "pillAuxiliary", spare_parts: "pillSpareParts", indirect_staff: "pillIndirectStaff" };
        for (var k in pcMap) {
            var pel = document.getElementById(pcMap[k]);
            if (pel) pel.textContent = "案例数 " + counts[k];
        }

        // 新版移动端手风琴徽章
        var mobMap = { yield: "mobilePillYield", substitute: "mobilePillSubstitute", reduce: "mobilePillReduce", headcount: "mobilePillHeadcount", hours: "mobilePillHours", utilities: "mobilePillUtilities", auxiliary: "mobilePillAuxiliary", spare_parts: "mobilePillSpareParts", indirect_staff: "mobilePillIndirectStaff" };
        for (var m in mobMap) {
            var mel = document.getElementById(mobMap[m]);
            if (mel) mel.textContent = "案例数 " + counts[m];
        }

        // 移动端分组汇总
        var matEl = document.getElementById("mobileCountMaterial");
        if (matEl) matEl.textContent = counts.yield + counts.substitute + counts.reduce;
        var labEl = document.getElementById("mobileCountLabor");
        if (labEl) labEl.textContent = counts.headcount + counts.hours;
        var ovhEl = document.getElementById("mobileCountOverhead");
        if (ovhEl) ovhEl.textContent = counts.utilities + counts.auxiliary + counts.spare_parts + counts.indirect_staff;
    }

    /* ---------- 4. 筛选逻辑 ---------- */
    function applyFilter(filter) {
        currentFilter = filter;
        // 更新筛选标签
        document.querySelectorAll(".filter-tag").forEach(function (tag) {
            tag.classList.toggle("active", tag.getAttribute("data-filter") === filter);
        });
        // 更新分类卡片高亮
        document.querySelectorAll(".category-card").forEach(function (card) {
            card.classList.toggle("active", card.getAttribute("data-category") === filter);
        });
        renderCases(filter);
    }

    // 筛选标签点击
    if (filterBar) {
        filterBar.addEventListener("click", function (e) {
            if (e.target.classList.contains("filter-tag")) {
                applyFilter(e.target.getAttribute("data-filter"));
            }
        });
    }

    // 分类卡片点击 → 跳转到独立页面
    document.querySelectorAll(".category-card").forEach(function (card) {
        card.addEventListener("click", function () {
            var cat = this.getAttribute("data-category");
            window.location.href = "category.html?cat=" + cat;
        });
    });

    /* ---------- 5. 案例详情弹窗 ---------- */
    function openModal(id) {
        var c = CASES.find(function (x) { return x.id === id; });
        if (!c) return;

        var html = ''
            + '<div class="detail-hero">'
            + '  <img src="' + c.cover + '" alt="' + c.title + '" onerror="this.src=\'https://via.placeholder.com/800x400/0052cc/ffffff?text=HPS\'">'
            + '  <span class="detail-badge">' + c.categoryName + '</span>'
            + '</div>'
            + '<div class="detail-content">'
            + '  <h2 class="detail-title">' + c.title + '</h2>'
            + '  <div class="detail-meta">'
            + '    <span>🏢 ' + c.company + '</span>'
            + '    <span>🏅 ' + c.level + '</span>'
            + '    <span>📅 ' + c.date + '</span>'
            + '  </div>'
            + '  <div class="detail-tags">'
            + c.tags.map(function (t) { return '<span class="case-tag">' + t + '</span>'; }).join("")
            + '  </div>'
            // 项目简介
            + '  <div class="detail-section">'
            + '    <h3>项目简介</h3>'
            + '    <p>' + c.summary + '</p>'
            + '  </div>'
            // 改善思路
            + '  <div class="detail-section">'
            + '    <h3>改善思路与实施步骤</h3>'
            + '    <ul>'
            + c.approach.map(function (a) { return '<li>' + a + '</li>'; }).join("")
            + '    </ul>'
            + '  </div>'
            // 项目实拍图
            + '  <div class="detail-section">'
            + '    <h3>项目实拍图</h3>'
            + '    <div class="detail-images">'
            + c.images.map(function (src) { return '<img src="' + src + '" alt="项目实拍" onerror="this.src=\'https://via.placeholder.com/600x400/e4e9ed/5a6b7d?text=实拍图\'">'; }).join("")
            + '    </div>'
            + '  </div>'
            // 落地成果
            + '  <div class="detail-section">'
            + '    <h3>落地成果</h3>'
            + '    <div class="detail-results">'
            + c.results.map(function (r) {
                return '<div class="detail-result-card"><div class="detail-result-num">' + r.num + '</div><div class="detail-result-label">' + r.label + '</div></div>';
            }).join("")
            + '    </div>'
            + '  </div>'
            + '</div>';

        modalBody.innerHTML = html;
        modalOverlay.classList.add("open");
        document.body.style.overflow = "hidden";
    }

    function closeModal() {
        modalOverlay.classList.remove("open");
        document.body.style.overflow = "";
    }

    if (modalClose) modalClose.addEventListener("click", closeModal);
    if (modalOverlay) {
        modalOverlay.addEventListener("click", function (e) {
            if (e.target === modalOverlay) closeModal();
        });
    }
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && modalOverlay.classList.contains("open")) closeModal();
    });

    /* ---------- 6. 移动端菜单 ---------- */
    if (menuToggle) {
        menuToggle.addEventListener("click", function () {
            menuToggle.classList.toggle("open");
            mainNav.classList.toggle("open");
        });
    }

    // 点击导航链接后关闭菜单
    navLinks.forEach(function (link) {
        link.addEventListener("click", function () {
            menuToggle.classList.remove("open");
            mainNav.classList.remove("open");
            // 更新active
            navLinks.forEach(function (l) { l.classList.remove("active"); });
            this.classList.add("active");
        });
    });

    /* ---------- 7. 返回顶部 ---------- */
    window.addEventListener("scroll", function () {
        if (window.scrollY > 400) {
            backTop.classList.add("show");
        } else {
            backTop.classList.remove("show");
        }
    });

    if (backTop) {
        backTop.addEventListener("click", function () {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    /* ---------- 8. 滚动监听导航高亮 ---------- */
    var sections = ["banner", "categories", "cases", "about", "qrcode"];
    window.addEventListener("scroll", function () {
        var scrollY = window.scrollY + 100;
        var currentSection = "banner";
        sections.forEach(function (id) {
            var el = document.getElementById(id);
            if (el && el.offsetTop <= scrollY) currentSection = id;
        });
        navLinks.forEach(function (link) {
            var href = link.getAttribute("href").replace("#", "");
            link.classList.toggle("active", href === currentSection);
        });
    });

    /* ---------- 9. 手风琴折叠切换 ---------- */
    window.toggleAccordion = function (btn) {
        var item = btn.closest(".accordion-item");
        if (!item) return;
        var isOpen = item.getAttribute("data-open") === "true";
        item.setAttribute("data-open", isOpen ? "false" : "true");
    };

    /* ---------- 10. 点击分类卡片筛选 ---------- */
    window.filterByCategory = function (category) {
        // 更新筛选标签高亮
        var tags = document.querySelectorAll(".filter-tag");
        tags.forEach(function (tag) {
            tag.classList.toggle("active", tag.getAttribute("data-filter") === category);
        });
        currentFilter = category;
        renderCases(category);
        // 滚动到案例区
        var casesSection = document.getElementById("cases");
        if (casesSection) {
            casesSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    };

    /* ---------- 11. 初始化 ---------- */
    function scrollToTop() {
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
    window.scrollToTop = scrollToTop;

    console.log("main.js v4 loaded, CASES length:", CASES.length);
    updateCounts();
    renderCases("all");
})();
