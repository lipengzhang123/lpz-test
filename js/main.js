/* ==================== 主交互逻辑 ==================== */
(function () {
    "use strict";

    /* ---------- 钉钉免登配置 ---------- */
    var params = new URLSearchParams(window.location.search);
    var CORP_ID = params.get('corpid') || 'ding53c7b55d07974d7335c2f4657eb6378f';
    var API_BASE = ''; // 同域相对路径，由 Cloudflare Worker Route 处理

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
                openModal(this.getAttribute("data-id"));
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

    /* ---------- 4.5. Markdown解析工具函数 ---------- */
    function parseMarkdown(text) {
        if (!text) return '';
        // 1) Markdown链接 [url](url) → <img>（链接文本和地址都是图片URL）
        text = text.replace(/\[(https?:\/\/[^\]]+\.(?:png|jpg|jpeg|gif|webp))\]\((https?:\/\/[^\)]+\.(?:png|jpg|jpeg|gif|webp))\)/gi, function (_, url1, url2) {
            return '<br><img src="' + url1 + '" alt="配图" style="max-width:100%;margin:8px 0;border-radius:4px;" onerror="this.style.display=\'none\'">';
        });
        // 2) 裸图片URL → <img>（排除已在<img src="...">属性值中的URL）
        text = text.replace(/(?<!src=")https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp)/gi, function (url) {
            return '<br><img src="' + url + '" alt="配图" style="max-width:100%;margin:8px 0;border-radius:4px;" onerror="this.style.display=\'none\'">';
        });
        // 3) Markdown加粗 **text** → <strong>text</strong>
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        return text;
    }

    /* ---------- 5. 案例详情弹窗 ---------- */
    function openModal(id) {
        var c = CASES.find(function (x) { return String(x.id) === String(id); });
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
            // 问题原因
            + '  <div class="detail-section">'
            + '    <h3>问题原因</h3>'
            + '    <p>' + parseMarkdown(c.summary) + '</p>'
            + '  </div>'
            // 解决思路与措施
            + '  <div class="detail-section">'
            + '    <h3>解决思路与措施</h3>'
            + '    <ul>'
            + c.approach.map(function (a) {
                // 解析markdown中的imagetour.lim图片URL并渲染为<img>
                // 支持两种格式：1) Markdown链接 [url](url)  2) 裸URL https://...
                var parts = a.split(/(\[https?:\/\/[^\]]+\]\(https?:\/\/[^)]+\.(?:png|jpg|jpeg|gif|webp)\)|https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp))/gi);
                return '<li>' + parts.map(function (p) {
                    if (/^https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp)/i.test(p)) {
                        return '<br><img src="' + p + '" alt="实施步骤配图" style="max-width:100%;margin:8px 0;border-radius:4px;" onerror="this.style.display=\'none\'">';
                    }
                    // Markdown链接格式 [url](url) → 提取URL
                    var mdMatch = p.match(/^\[(https?:\/\/[^\]]+\.(?:png|jpg|jpeg|gif|webp))\]\((https?:\/\/[^\)]+\.(?:png|jpg|jpeg|gif|webp))\)$/i);
                    if (mdMatch) {
                        return '<br><img src="' + mdMatch[1] + '" alt="实施步骤配图" style="max-width:100%;margin:8px 0;border-radius:4px;" onerror="this.style.display=\'none\'">';
                    }
                    // Markdown加粗 **text** → <strong>text</strong>
                    p = p.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                    return p;
                }).join("") + '</li>';
            }).join("")
            + '    </ul>'
            + '  </div>'
            // 项目成果
            + '  <div class="detail-section">'
            + '    <h3>项目成果</h3>'
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

    /* ---------- 11. 从静态JSON加载案例数据 ---------- */
    async function loadCasesFromBackend() {
        try {
            var res = await fetch('data/cases.json');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var json = await res.json();
            
            if (json.data && json.data.length > 0) {
                window.CASES = json.data;
                updateCounts();
                renderCases(currentFilter);
                console.log('✅ Loaded', json.data.length, 'cases from data/cases.json');
            } else {
                throw new Error('Empty response');
            }
        } catch (e) {
            console.error(' Failed to load cases:', e);
            document.getElementById('caseGrid').innerHTML = 
                '<div style="text-align:center;padding:60px 20px;color:#999;">' +
                '<p style="font-size:18px;margin-bottom:12px;">️ 数据加载失败</p>' +
                '<p style="font-size:14px;">请检查网络连接或联系管理员</p>' +
                '<p style="font-size:12px;margin-top:8px;color:#ccc;">' + e.message + '</p>' +
                '</div>';
        }
    }

    /* ---------- 12. 初始化 ---------- */
    function scrollToTop() {
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
    window.scrollToTop = scrollToTop;

    console.log("main.js v5 loaded");
    
    // 更新JS状态指示器
    var jsStatus = document.getElementById('js-status');
    if (jsStatus) {
        jsStatus.textContent = 'JS: 已就绪';
        jsStatus.style.opacity = '1';
    }
    
    // 从API加载实时数据
    loadCasesFromBackend();
})();
