---
layout: page
title: "guestbook"
permalink: /guestbook/
nav: false
nav_order: 3
---

Hi! Let me hear you.
- What brought you here?
- What are you interested in?

<div id="cusdis_thread"
  data-host="https://cusdis.com"
  data-app-id="8078c3c4-79fa-4472-b28f-3223b40b60f9"
  data-page-id="{{ PAGE_ID }}"
  data-page-url="{{ PAGE_URL }}"
  data-page-title="{{ PAGE_TITLE }}"
></div>
<script async defer src="https://cusdis.com/js/cusdis.es.js"></script>

<script>
  // 다크모드 자동 연동(사이트에 다크모드가 있다면)
  const setCusdisTheme = () => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    window.CUSDIS && window.CUSDIS.setTheme(prefersDark ? 'dark' : 'light');
  };
  setCusdisTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setCusdisTheme);
</script>


