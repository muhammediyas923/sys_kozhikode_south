/**
 * SYS User Payments Client-side Logic
 * Razorpay Standard Checkout & Payment History
 */
document.addEventListener('DOMContentLoaded', () => {
  const customAmountInput = document.getElementById('custom-amount');
  const purposeSelect = document.getElementById('payment-purpose');
  const descInput = document.getElementById('payment-desc');
  const startPaymentBtn = document.getElementById('start-payment-btn');
  const btnAmountDisplay = document.getElementById('btn-amount-display');
  const paymentAlert = document.getElementById('payment-alert');
  const presetBtns = document.querySelectorAll('.preset-amount-btn');
  const refreshHistoryBtn = document.getElementById('refresh-history-btn');
  const historyTbody = document.getElementById('user-history-tbody');
  const receiptModalBackdrop = document.getElementById('receipt-modal-backdrop');
  const closeReceiptModalBtn = document.getElementById('close-receipt-modal');
  const doneReceiptBtn = document.getElementById('done-receipt-btn');
  const printReceiptBtn = document.getElementById('print-receipt-btn');
  const receiptModalBody = document.getElementById('receipt-modal-body');

  function showAlert(message, type = 'danger') {
    paymentAlert.className = `alert alert-${type} py-2 px-3 mb-3`;
    paymentAlert.textContent = message;
    paymentAlert.classList.remove('d-none');
  }

  function hideAlert() {
    paymentAlert.classList.add('d-none');
    paymentAlert.textContent = '';
  }

  function updateAmountDisplay(val) {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      btnAmountDisplay.textContent = `₹${num.toLocaleString('en-IN')}`;
    } else {
      btnAmountDisplay.textContent = '₹0';
    }
  }

  // Preset amount button clicks
  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      presetBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const amt = btn.getAttribute('data-amount');
      customAmountInput.value = amt;
      updateAmountDisplay(amt);
      hideAlert();
    });
  });

  // Custom amount input event
  customAmountInput.addEventListener('input', (e) => {
    const val = e.target.value;
    updateAmountDisplay(val);
    hideAlert();
    presetBtns.forEach((b) => {
      if (b.getAttribute('data-amount') === val) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
  });

  // Start Payment flow
  startPaymentBtn.addEventListener('click', async () => {
    hideAlert();
    const amountVal = customAmountInput.value.trim();
    const purpose = purposeSelect.value;
    const description = descInput.value.trim();

    const amount = parseFloat(amountVal);
    if (isNaN(amount) || amount <= 0) {
      showAlert('Please enter a valid payment amount (minimum ₹1).');
      return;
    }
    if (amount < 1) {
      showAlert('Minimum payment amount is ₹1.');
      return;
    }
    if (amount > 500000) {
      showAlert('Maximum payment amount is ₹5,00,000.');
      return;
    }

    // Disable button and show loading state
    startPaymentBtn.disabled = true;
    const originalBtnHtml = startPaymentBtn.innerHTML;
    startPaymentBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Initiating Razorpay Checkout...';

    try {
      // 1. Request backend to create Razorpay Order
      const resp = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, purpose, description }),
      });

      const data = await resp.json();

      if (!resp.ok || !data.success) {
        throw new Error(data.message || 'Failed to create payment order. Please try again.');
      }

      const order = data.order;

      // 2. Configure and open Razorpay Standard Checkout Modal
      const options = {
        key: order.keyId || window.__RAZORPAY_KEY_ID__,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'SYS Kozhikode South',
        description: order.purpose || 'SYS Committee Contribution',
        image: '/images/Gemini_Generated_Image_41luhh41luhh41lu-removebg-preview.png',
        order_id: order.orderId,
        prefill: {
          name: window.__USER_DETAILS__?.name || '',
          contact: '',
          email: '',
        },
        notes: {
          purpose: order.purpose,
          role: window.__USER_DETAILS__?.role || '',
        },
        theme: {
          color: '#14533e',
        },
        modal: {
          ondismiss: function () {
            startPaymentBtn.disabled = false;
            startPaymentBtn.innerHTML = originalBtnHtml;
            // Notify server of dismissed/cancelled checkout
            fetch('/api/payments/failure', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId: order.orderId,
                errorCode: 'CHECKOUT_DISMISSED',
                errorDescription: 'User closed the Razorpay checkout without completing payment.',
              }),
            }).catch(() => {});
            showAlert('Checkout was closed. You can retry when ready.', 'warning');
            loadHistory();
          },
        },
        handler: async function (response) {
          // 3. Payment succeeded on frontend -> send to backend for signature verification
          startPaymentBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Verifying Payment Signature...';

          try {
            const verifyResp = await fetch('/api/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verifyData = await verifyResp.json();

            if (!verifyResp.ok || !verifyData.success) {
              throw new Error(verifyData.message || 'Payment verification failed on server.');
            }

            // Success!
            showAlert('Payment successful! Your transaction has been verified.', 'success');
            customAmountInput.value = '500';
            descInput.value = '';
            updateAmountDisplay('500');

            await loadHistory();
            openReceiptModal(response.razorpay_order_id);
          } catch (err) {
            showAlert(err.message || 'Payment verification failed.', 'danger');
            loadHistory();
          } finally {
            startPaymentBtn.disabled = false;
            startPaymentBtn.innerHTML = originalBtnHtml;
          }
        },
      };

      const rzp = new window.Razorpay(options);

      rzp.on('payment.failed', function (failResp) {
        startPaymentBtn.disabled = false;
        startPaymentBtn.innerHTML = originalBtnHtml;

        const error = failResp.error || {};
        fetch('/api/payments/failure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: order.orderId,
            paymentId: error.metadata?.payment_id,
            errorCode: error.code,
            errorDescription: error.description || error.reason,
          }),
        }).catch(() => {});

        showAlert(`Payment failed: ${error.description || 'Transaction declined'}`, 'danger');
        loadHistory();
      });

      rzp.open();
    } catch (err) {
      showAlert(err.message || 'Network error while initiating payment.', 'danger');
      startPaymentBtn.disabled = false;
      startPaymentBtn.innerHTML = originalBtnHtml;
    }
  });

  // Fetch payment history
  async function loadHistory() {
    try {
      const resp = await fetch('/api/payments/history');
      const data = await resp.json();

      if (!data.success || !data.history) return;

      renderHistory(data.history);
    } catch (err) {
      console.error('Failed to reload history:', err);
    }
  }

  function renderHistory(list) {
    if (!list || !list.length) {
      historyTbody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="ds-empty">
              <i class="ph ph-receipt ds-empty-icon"></i>
              <h3>No payments yet</h3>
              <p>Completed payments will appear in this history table.</p>
            </div>
          </td>
        </tr>`;
      return;
    }

    historyTbody.innerHTML = list
      .map((p) => {
        const dateStr = p.createdAt
          ? new Date(p.createdAt).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '-';

        let badgeHtml = '';
        if (p.status === 'paid') {
          badgeHtml = '<span class="ds-badge ds-badge-success"><i class="ph ph-check-circle"></i> Paid</span>';
        } else if (p.status === 'failed') {
          badgeHtml = '<span class="ds-badge ds-badge-danger"><i class="ph ph-x-circle"></i> Failed</span>';
        } else {
          badgeHtml = `<span class="ds-badge ds-badge-warning"><i class="ph ph-clock"></i> ${p.status}</span>`;
        }

        return `
          <tr>
            <td>${dateStr}</td>
            <td><code>${p.orderId}</code></td>
            <td>${p.paymentId ? `<code class="text-success">${p.paymentId}</code>` : '<span class="text-muted">—</span>'}</td>
            <td>${p.purpose || '-'}</td>
            <td class="fw-bold">₹${Number(p.amount || 0).toLocaleString('en-IN')}</td>
            <td>${badgeHtml}</td>
            <td>
              <button type="button" class="ds-btn ds-btn-outline ds-btn-sm view-receipt-btn" data-id="${p._id}">
                <i class="ph ph-receipt"></i> Receipt
              </button>
            </td>
          </tr>`;
      })
      .join('');

    attachReceiptListeners();
  }

  function attachReceiptListeners() {
    document.querySelectorAll('.view-receipt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openReceiptModalById(id);
      });
    });
  }

  // Open Receipt Modal
  async function openReceiptModalById(id) {
    receiptModalBackdrop.classList.add('open');
    receiptModalBody.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-success" role="status"></div><div class="mt-2 text-muted">Loading receipt...</div></div>';

    try {
      const resp = await fetch(`/api/payments/${id}`);
      const data = await resp.json();
      if (!data.success || !data.payment) {
        receiptModalBody.innerHTML = '<div class="alert alert-danger">Unable to load receipt details.</div>';
        return;
      }

      renderReceiptSlip(data.payment);
    } catch (err) {
      receiptModalBody.innerHTML = '<div class="alert alert-danger">Error fetching receipt.</div>';
    }
  }

  async function openReceiptModal(orderId) {
    receiptModalBackdrop.classList.add('open');
    receiptModalBody.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-success" role="status"></div></div>';

    try {
      const resp = await fetch('/api/payments/history');
      const data = await resp.json();
      const p = data.history?.find((x) => x.orderId === orderId);
      if (p) {
        renderReceiptSlip(p);
      } else {
        receiptModalBody.innerHTML = '<div class="alert alert-warning">Payment recorded. Click history to view receipt.</div>';
      }
    } catch (err) {
      receiptModalBody.innerHTML = '<div class="alert alert-danger">Error rendering receipt.</div>';
    }
  }

  function renderReceiptSlip(p) {
    const isPaid = p.status === 'paid';
    const dateStr = p.paidAt
      ? new Date(p.paidAt).toLocaleString('en-IN')
      : new Date(p.createdAt).toLocaleString('en-IN');

    receiptModalBody.innerHTML = `
      <div class="p-3 border rounded-3 bg-white" id="printable-receipt">
        <div class="text-center border-bottom pb-3 mb-3">
          <img src="/images/Gemini_Generated_Image_41luhh41luhh41lu-removebg-preview.png" alt="SYS" style="height:48px;" class="mb-2">
          <h5 class="fw-bold mb-0 text-success">SYS KOZHIKODE SOUTH</h5>
          <div class="text-muted small">Sunni Yuvajana Sangham District Committee</div>
          <div class="badge ${isPaid ? 'bg-success' : 'bg-warning text-dark'} mt-2">
            ${isPaid ? 'PAYMENT SUCCESSFUL' : p.status.toUpperCase()}
          </div>
        </div>

        <div class="mb-3 text-center">
          <span class="text-muted small text-uppercase">Amount Paid</span>
          <div class="fs-2 fw-bold text-dark">₹${Number(p.amount || 0).toLocaleString('en-IN')}</div>
          <div class="badge bg-light text-muted border">${p.currency || 'INR'}</div>
        </div>

        <div class="table-responsive">
          <table class="table table-sm table-borderless mb-0" style="font-size:0.875rem;">
            <tbody>
              <tr>
                <td class="text-muted">Purpose:</td>
                <td class="fw-semibold text-end">${p.purpose || 'General Contribution'}</td>
              </tr>
              <tr>
                <td class="text-muted">Payer Name:</td>
                <td class="fw-semibold text-end">${p.displayName || p.username}</td>
              </tr>
              <tr>
                <td class="text-muted">Role:</td>
                <td class="text-end">${p.role}</td>
              </tr>
              ${p.zone ? `<tr><td class="text-muted">Zone:</td><td class="text-end">${p.zone}</td></tr>` : ''}
              ${p.circle ? `<tr><td class="text-muted">Circle:</td><td class="text-end">${p.circle}</td></tr>` : ''}
              <tr>
                <td class="text-muted">Payment ID:</td>
                <td class="text-end font-monospace small">${p.paymentId || '—'}</td>
              </tr>
              <tr>
                <td class="text-muted">Order ID:</td>
                <td class="text-end font-monospace small">${p.orderId}</td>
              </tr>
              <tr>
                <td class="text-muted">Date & Time:</td>
                <td class="text-end small">${dateStr}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="border-top pt-3 mt-3 text-center text-muted" style="font-size:0.75rem;">
          <div><i class="ph ph-shield-check text-success"></i> Verified by Razorpay Secure Payments</div>
          <div>Computer-generated electronic receipt. No physical signature required.</div>
        </div>
      </div>
    `;
  }

  // Modal controls
  function closeReceiptModal() {
    receiptModalBackdrop.classList.remove('open');
  }

  closeReceiptModalBtn.addEventListener('click', closeReceiptModal);
  doneReceiptBtn.addEventListener('click', closeReceiptModal);
  receiptModalBackdrop.addEventListener('click', (e) => {
    if (e.target === receiptModalBackdrop) closeReceiptModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && receiptModalBackdrop.classList.contains('open')) {
      closeReceiptModal();
    }
  });

  // Delegated click for receipt buttons in history table
  document.getElementById('history-table-body')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.view-receipt-btn');
    if (btn) {
      const id = btn.getAttribute('data-id');
      if (id) {
        openReceiptModalById(id);
      } else {
        const orderId = btn.getAttribute('data-order-id');
        if (orderId) openReceiptModal(orderId);
      }
    }
  });

  // Mobile sidebar toggle with touch support
  const sidebarEl = document.getElementById('sidebar');
  const overlayEl = document.getElementById('sidebar-overlay');
  const toggleBtn = document.getElementById('sidebar-toggle');

  let _sbBusy = false;
  window.toggleSidebar = (e) => {
    if (e) {
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
    }
    if (_sbBusy) return;
    _sbBusy = true;
    setTimeout(() => { _sbBusy = false; }, 250);
    sidebarEl?.classList.toggle('open');
    overlayEl?.classList.toggle('open');
  };

  if (toggleBtn) {
    toggleBtn.addEventListener('click', window.toggleSidebar);
    toggleBtn.addEventListener('touchend', (e) => {
      window.toggleSidebar(e);
    }, { passive: false });
  }

  if (overlayEl) {
    const closeSb = (e) => {
      if (e) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
      }
      sidebarEl?.classList.remove('open');
      overlayEl?.classList.remove('open');
    };
    overlayEl.addEventListener('click', closeSb);
    overlayEl.addEventListener('touchend', closeSb, { passive: false });
  }

  sidebarEl?.querySelectorAll('.ds-nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 991) {
        sidebarEl?.classList.remove('open');
        overlayEl?.classList.remove('open');
      }
    });
  });

  printReceiptBtn.addEventListener('click', () => {
    const printContent = document.getElementById('printable-receipt');
    if (!printContent) return;
    const win = window.open('', '', 'width=600,height=600');
    win.document.write('<html><head><title>SYS Payment Receipt</title>');
    win.document.write('<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">');
    win.document.write('</head><body style="padding:20px;">');
    win.document.write(printContent.innerHTML);
    win.document.write('</body></html>');
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 400);
  });

  refreshHistoryBtn.addEventListener('click', loadHistory);
  attachReceiptListeners();
});
