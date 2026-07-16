/* Super Admin Profile JS */

document.addEventListener('DOMContentLoaded', () => {
  const { showToast } = window.dsUtils;

  const editUsernameBtn = document.getElementById('edit-username-btn');
  const cancelUsernameBtn = document.getElementById('cancel-username-btn');
  const usernameForm = document.getElementById('username-form');
  const currentUsernameEl = document.getElementById('current-username');
  const newUsernameInput = document.getElementById('new-username');
  const usernameFeedback = document.getElementById('username-feedback');

  const passwordForm = document.getElementById('password-form');
  const currentPasswordInput = document.getElementById('current-password');
  const newPasswordInput = document.getElementById('new-password');
  const confirmPasswordInput = document.getElementById('confirm-password');
  const passwordFeedback = document.getElementById('password-feedback');

  function toggleUsernameEdit(open) {
    usernameForm.classList.toggle('d-none', !open);
    editUsernameBtn.classList.toggle('d-none', open);
    if (open) {
      newUsernameInput.value = currentUsernameEl.textContent.trim();
      usernameFeedback.classList.add('d-none');
      newUsernameInput.focus();
    }
  }

  function validateUsername(username) {
    if (!username) return 'Username cannot be empty.';
    if (username.length < 4) return 'Username must be at least 4 characters.';
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
      return 'Username may only contain letters, numbers, dot, underscore and hyphen.';
    }
    return '';
  }

  function validatePassword(currentPassword, newPassword, confirmPassword) {
    if (!currentPassword) return 'Current password is required.';
    if (!newPassword) return 'New password is required.';
    if (newPassword !== confirmPassword) return 'Passwords do not match.';
    if (newPassword === currentPassword) return 'New password must be different from the current password.';
    if (newPassword.length < 10) return 'Password must be at least 10 characters long.';
    if (!/[A-Z]/.test(newPassword)) return 'Password must include at least one uppercase letter.';
    if (!/[a-z]/.test(newPassword)) return 'Password must include at least one lowercase letter.';
    if (!/[0-9]/.test(newPassword)) return 'Password must include at least one number.';
    if (!/[!@#$%^&*()_+\[\]{};:\'"\\|,.<>\/?~-]/.test(newPassword)) {
      return 'Password must include at least one special character.';
    }
    return '';
  }

  editUsernameBtn?.addEventListener('click', () => toggleUsernameEdit(true));
  cancelUsernameBtn?.addEventListener('click', () => toggleUsernameEdit(false));

  usernameForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const newUsername = newUsernameInput.value.trim();
    const validationError = validateUsername(newUsername);
    if (validationError) {
      usernameFeedback.textContent = validationError;
      usernameFeedback.classList.remove('d-none');
      return;
    }

    try {
      const resp = await fetch('/api/admin/profile/username', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername }),
      });
      const data = await resp.json();
      if (!data.success) {
        usernameFeedback.textContent = data.message || 'Unable to update username.';
        usernameFeedback.classList.remove('d-none');
        return;
      }

      currentUsernameEl.textContent = newUsername;
      usernameFeedback.classList.add('d-none');
      toggleUsernameEdit(false);
      showToast('Username updated successfully.', 'success');
    } catch (err) {
      usernameFeedback.textContent = 'Unable to update username. Please try again.';
      usernameFeedback.classList.remove('d-none');
    }
  });

  passwordForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const currentPassword = currentPasswordInput.value.trim();
    const newPassword = newPasswordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();
    const validationError = validatePassword(currentPassword, newPassword, confirmPassword);
    if (validationError) {
      passwordFeedback.textContent = validationError;
      passwordFeedback.classList.remove('d-none');
      return;
    }

    try {
      const resp = await fetch('/api/admin/profile/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await resp.json();
      if (!data.success) {
        passwordFeedback.textContent = data.message || 'Unable to change password.';
        passwordFeedback.classList.remove('d-none');
        return;
      }

      passwordFeedback.classList.add('d-none');
      currentPasswordInput.value = '';
      newPasswordInput.value = '';
      confirmPasswordInput.value = '';
      showToast('Password changed successfully. Please log in again.', 'success');
      setTimeout(() => {
        window.location.href = '/logout';
      }, 1200);
    } catch (err) {
      passwordFeedback.textContent = 'Unable to change password. Please try again.';
      passwordFeedback.classList.remove('d-none');
    }
  });

  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    window.toggleSidebar?.();
  });
});
