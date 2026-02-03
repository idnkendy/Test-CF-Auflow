
import { PricingPlan } from '../types';

export const plansVI: PricingPlan[] = [
    {
        id: 'plan_starter',
        name: 'Starter',
        price: 299000,
        currency: 'đ',
        features: [
            'Tổng 3,000 Credits',
            'Gói tiêu chuẩn',
            'Hạn sử dụng: 1 Tháng',
            'Truy cập tất cả công cụ AI',
            'Render tốc độ tiêu chuẩn',
            'Hỗ trợ ưu tiên 24/7',
            'Tính năng truy cập sớm'
        ],
        type: 'subscription',
        credits: 3000,
        durationMonths: 1,
        description: 'Gói trải nghiệm cho người mới bắt đầu.'
    },
    {
        id: 'plan_pro',
        name: 'Pro',
        price: 599000,
        originalPrice: 700000,
        currency: 'đ',
        features: [
            'Tổng 7,000 Credits',
            'Hạn sử dụng: 3 Tháng',
            'Tối ưu chi phí & hiệu năng',
            'Truy cập tất cả công cụ AI',
            'Render tốc độ cao',
            'Hỗ trợ ưu tiên 24/7',
            'Tính năng truy cập sớm'
        ],
        type: 'subscription',
        credits: 7000,
        highlight: true,
        durationMonths: 3,
        description: 'Lựa chọn tốt nhất cho Kiến trúc sư & Freelancer.'
    },
    {
        id: 'plan_ultra',
        name: 'Ultra',
        price: 1999000,
        originalPrice: 2500000,
        currency: 'đ',
        features: [
            'Tổng 25,000 Credits',
            'Hạn sử dụng: 6 Tháng',
            'Chi phí rẻ nhất/credit',
            'Truy cập tất cả công cụ AI',
            'Render tốc độ siêu tốc',
            'Hỗ trợ ưu tiên 24/7',
            'Tính năng truy cập sớm'
        ],
        type: 'subscription',
        credits: 25000,
        durationMonths: 6,
        description: 'Giải pháp tối ưu cho Studio và Doanh nghiệp.'
    }
];

// NOTE: Replace the '#' with your actual Polar.sh product checkout URLs
export const plansEN: PricingPlan[] = [
    {
        id: 'plan_global_weekly',
        name: 'Weekly Pass',
        price: 9.99,
        currency: '$',
        features: [
            'Total 1,000 Credits',
            'Standard Plan',
            'Duration: 7 Days',
            'Access all AI Tools',
            'Standard Rendering Speed',
            'Priority Support 24/7',
            'Early Access to Features'
        ],
        type: 'subscription',
        credits: 1000,
        durationMonths: 0.25,
        description: 'Ideal for short projects. Auto-renews weekly.',
        paymentLink: 'https://buy.polar.sh/polar_cl_2oo0YPVJiVxZMsxp7KRNiTezy6myZe25XXHi82k3T9b'
    },
    {
        id: 'plan_global_monthly',
        name: 'Pro Monthly',
        price: 29.00,
        originalPrice: 39.00,
        currency: '$',
        features: [
            'Total 4,000 Credits',
            'Duration: 1 Month',
            'Cost & Performance Optimized',
            'Access all AI Tools',
            'Fast Rendering Speed',
            'Priority Support 24/7',
            'Early Access to Features'
        ],
        type: 'subscription',
        credits: 4000,
        highlight: true,
        durationMonths: 1,
        description: 'Best for freelancers. Auto-renews monthly.',
        paymentLink: 'https://buy.polar.sh/polar_cl_DUk4lCyfr2b70n464w59zwRwcWMIzWkCpPylI2zpwJd'
    },
    {
        id: 'plan_global_yearly',
        name: 'Yearly Elite',
        price: 249.00,
        originalPrice: 468.00,
        currency: '$',
        features: [
            'Total 48,000 Credits',
            'Duration: 12 Months',
            'Lowest Cost per Credit',
            'Access all AI Tools',
            'Ultra-Fast Rendering Speed',
            'Priority Support 24/7',
            'Early Access to Features'
        ],
        type: 'subscription',
        credits: 48000,
        durationMonths: 12,
        description: 'Maximum power for studios. Auto-renews annually.',
        paymentLink: 'https://buy.polar.sh/polar_cl_IUySOVcSpKL4iHlL6jpZZriGtTiPDkGRhUIuR4cy1Ut'
    },
    {
        id: 'plan_global_credit',
        name: 'Credit Booster',
        price: 6.00,
        currency: '$',
        features: [
            'Total 1,000 Credits',
            'Add-on Plan',
            'Access all AI Tools',
            'Priority Support 24/7'
        ],
        type: 'credit',
        credits: 1000,
        durationMonths: 0,
        description: 'One-time add-on for active subscribers.',
        paymentLink: 'https://buy.polar.sh/polar_cl_Dls0MNmGpYVTmbYRHP2NAWKYAh7iZ9j8OfJhl0o428A'
    }
];

// Combined list for validation services
export const plans = [...plansVI, ...plansEN];
